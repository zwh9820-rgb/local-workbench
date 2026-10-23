import { eq } from 'drizzle-orm';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { db } from '@/db';
import {
  agentSession,
  type AgentMessage,
  type AgentMode,
  type AgentSession,
  type AgentToolCallRef,
} from '@/db/schema';
import { truncate } from '@/lib/utils';
import { getLmClient, resolveModel } from './client';
import { buildSystemPrompt } from './prompt';
import { executeTool, toOpenAITools, type ToolExecution } from './tools';

/**
 * Agent 主循环（方案 A：内嵌在本项目里，不依赖任何外部 DSH 程序）
 *
 * 流程：
 *   用户消息 → 组装历史 → 请求 LM Studio（带 tools）
 *   → 有 tool_calls 就逐个执行、把结果回灌
 *   → 直到模型给出纯文本回答，或达到最大轮次
 *
 * 每一次工具调用都会写入 agent_tool_log，便于审计与前端回放。
 */

const MAX_STEPS = Number(process.env.AGENT_MAX_STEPS ?? 6);
const HISTORY_LIMIT = 24;

export type RunAgentParams = {
  sessionId?: string;
  userMessage: string;
  mode: AgentMode;
  model?: string;
  /** 页面右键选中的文本，作为附加上下文 */
  selectedText?: string;
};

export type RunAgentResult = {
  session: AgentSession;
  model: string;
  assistantMessage: AgentMessage;
  toolExecutions: ToolExecution[];
  steps: number;
};

/** 把存储格式还原成 OpenAI 消息（含 tool_calls / tool 结果） */
function toOpenAIMessages(messages: AgentMessage[]): ChatCompletionMessageParam[] {
  return messages
    .map((m): ChatCompletionMessageParam | null => {
      if (m.role === 'assistant') {
        if (m.toolCalls?.length) {
          return {
            role: 'assistant',
            content: m.content || null,
            tool_calls: m.toolCalls.map((tc) => ({
              id: tc.id,
              type: 'function' as const,
              function: { name: tc.name, arguments: tc.arguments },
            })),
          };
        }
        return { role: 'assistant', content: m.content };
      }
      if (m.role === 'tool') {
        if (!m.toolCallId) return null; // 孤立 tool 消息会被 API 拒绝
        return { role: 'tool', tool_call_id: m.toolCallId, content: m.content };
      }
      if (m.role === 'system') return { role: 'system', content: m.content };
      return { role: 'user', content: m.content };
    })
    .filter((m): m is ChatCompletionMessageParam => m !== null);
}

/** 截取最近历史，并去掉开头孤立的 tool 消息 */
function trimHistory(messages: AgentMessage[]): AgentMessage[] {
  let slice = messages.slice(-HISTORY_LIMIT);
  while (slice.length && slice[0].role === 'tool') slice = slice.slice(1);
  return slice;
}

export async function runAgent(params: RunAgentParams): Promise<RunAgentResult> {
  const { userMessage, mode, selectedText } = params;

  /* 1. 会话准备 */
  let session: AgentSession | undefined;

  if (params.sessionId) {
    const [found] = await db
      .select()
      .from(agentSession)
      .where(eq(agentSession.id, params.sessionId))
      .limit(1);
    session = found;
  }

  const model = await resolveModel(params.model);

  if (!session) {
    const [created] = await db
      .insert(agentSession)
      .values({
        title: truncate(userMessage, 30) || '新会话',
        mode,
        model,
        messages: [],
        messageCount: 0,
      })
      .returning();
    session = created;
  }

  /* 2. 追加用户消息 */
  const history = Array.isArray(session.messages) ? [...session.messages] : [];

  const userContent = selectedText
    ? `${userMessage}\n\n---\n【用户在页面上选中的内容】\n${selectedText}`
    : userMessage;

  history.push({
    id: crypto.randomUUID(),
    role: 'user',
    content: userContent,
    createdAt: Date.now(),
  });

  /* 3. 组装请求消息 */
  const chatMessages: ChatCompletionMessageParam[] = [
    { role: 'system', content: buildSystemPrompt(mode) },
    ...toOpenAIMessages(trimHistory(history)),
  ];

  const tools = toOpenAITools(mode);
  const client = getLmClient();
  const toolExecutions: ToolExecution[] = [];

  let finalText = '';
  let steps = 0;

  try {
    /* 4. 循环：模型 → 工具 → 模型 */
    for (let i = 0; i < MAX_STEPS; i += 1) {
      steps += 1;

      const completion = await client.chat.completions.create({
        model,
        messages: chatMessages,
        tools: tools.length ? tools : undefined,
        tool_choice: tools.length ? 'auto' : undefined,
        temperature: 0.3,
        max_tokens: 2048,
      });

      const choice = completion.choices[0]?.message;
      if (!choice) throw new Error('LM Studio 返回了空响应');

      const calls = choice.tool_calls ?? [];

      // 4a. 没有工具调用 → 就是最终回答
      if (calls.length === 0) {
        finalText = choice.content ?? '';
        history.push({
          id: crypto.randomUUID(),
          role: 'assistant',
          content: finalText,
          createdAt: Date.now(),
        });
        chatMessages.push({ role: 'assistant', content: finalText });
        break;
      }

      // 4b. 有工具调用 → 先记录 assistant 的 tool_calls
      const assistantMsgId = crypto.randomUUID();
      const toolRefs: AgentToolCallRef[] = calls.map((c) => ({
        id: c.id,
        name: c.function?.name ?? '',
        arguments: c.function?.arguments ?? '{}',
      }));

      history.push({
        id: assistantMsgId,
        role: 'assistant',
        content: choice.content ?? '',
        toolCalls: toolRefs,
        createdAt: Date.now(),
      });

      chatMessages.push({
        role: 'assistant',
        content: choice.content ?? null,
        tool_calls: toolRefs.map((tc) => ({
          id: tc.id,
          type: 'function' as const,
          function: { name: tc.name, arguments: tc.arguments },
        })),
      });

      // 4c. 逐个执行工具，结果回灌
      for (const call of calls) {
        const exec = await executeTool(
          call.function?.name ?? '',
          call.function?.arguments ?? '{}',
          { sessionId: session.id, mode, messageId: assistantMsgId },
        );
        toolExecutions.push(exec);

        history.push({
          id: crypto.randomUUID(),
          role: 'tool',
          content: exec.content,
          toolCallId: call.id,
          toolName: exec.toolName,
          createdAt: Date.now(),
        });

        chatMessages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: exec.content,
        });
      }
    }

    /* 5. 达到最大轮次仍未收尾 → 给一个兜底回答 */
    if (!finalText) {
      finalText =
        '工具调用轮次已达到上限，先给你阶段性结果。如果需要继续，请把任务拆得更具体一些。';
      history.push({
        id: crypto.randomUUID(),
        role: 'assistant',
        content: finalText,
        createdAt: Date.now(),
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : '未知错误';
    // 把已产生的上下文落库，避免用户丢失这一轮的内容
    await db
      .update(agentSession)
      .set({
        messages: history,
        messageCount: history.length,
        lastMessageAt: new Date(),
        updatedAt: new Date(),
        model,
      })
      .where(eq(agentSession.id, session.id));

    if (/ECONNREFUSED|fetch failed|Connection error|timed out/i.test(message)) {
      throw new Error(
        '无法连接 LM Studio（http://127.0.0.1:1234/v1）。请先启动 LM Studio，加载 DeepSeek 模型并在 Developer 页开启本地服务。',
      );
    }
    throw new Error(`Agent 调用失败：${message}`);
  }

  /* 6. 落库 */
  const [updated] = await db
    .update(agentSession)
    .set({
      messages: history,
      messageCount: history.length,
      lastMessageAt: new Date(),
      updatedAt: new Date(),
      model,
      mode,
    })
    .where(eq(agentSession.id, session.id))
    .returning();

  const assistantMessage =
    [...history].reverse().find((m) => m.role === 'assistant' && !m.toolCalls) ?? {
      id: crypto.randomUUID(),
      role: 'assistant' as const,
      content: finalText,
      createdAt: Date.now(),
    };

  return {
    session: updated,
    model,
    assistantMessage,
    toolExecutions,
    steps,
  };
}
