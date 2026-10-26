/**
 * Agent 主循环（服务端）
 * ----------------------------------------------------------------------------
 * 用 OpenAI SDK 连接本地 LM Studio（OpenAI 兼容接口），原生 function calling。
 * 每一轮：LLM 决定是否调工具 → 执行 → 结果回灌 → 继续，直到无工具调用或达到上限。
 *
 * 所有会话与工具调用都落库（agent_session / agent_tool_log），支持回放。
 */
import OpenAI from 'openai';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import {
  agentSession,
  agentToolLog,
  type AgentMessage,
  type AgentToolCall,
} from '@/db/schema';
import { readSettings } from '@/server/settings';
import { uuid } from '@/lib/utils';
import { TOOLS, TOOL_DEFINITIONS } from './tools';

const DEFAULT_SYSTEM_PROMPT = `你是「本地 AI 内容工作台」的内嵌助手，帮用户管理待办、灵感、复盘和项目画布。

硬性约束（必须遵守）：
1. 只能通过提供的工具操作本系统数据库内的数据。禁止尝试读写文件、执行命令。
2. 绝对不要提交 ComfyUI 生成任务。图生图/文生图必须由用户手动点击画布节点上的「运行」按钮。你只能帮用户准备提示词、整理工作流文本、查看已有结果。
3. 不确定的数据不要编造，先调用工具查询。

回答要求：
- 用简体中文，Markdown 格式，简洁直接，不要客套话。
- 操作完成后用一句话说明改了什么（例如「已新建待办：整理分镜图」）。
- 涉及多条数据时用列表呈现，不要长篇复述。`;

/** 内部消息 → OpenAI 消息格式 */
function toOpenAIMessages(
  messages: AgentMessage[],
  systemPrompt?: string | null,
): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
  const out: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt?.trim() || DEFAULT_SYSTEM_PROMPT },
  ];

  for (const m of messages) {
    if (m.role === 'user') {
      out.push({ role: 'user', content: m.content });
    } else if (m.role === 'assistant') {
      const hasTools = Boolean(m.toolCalls?.length);
      out.push({
        role: 'assistant',
        content: m.content || null,
        ...(hasTools
          ? {
              tool_calls: m.toolCalls!.map((tc) => ({
                id: tc.id,
                type: 'function' as const,
                function: { name: tc.name, arguments: tc.arguments || '{}' },
              })),
            }
          : {}),
      });
    } else if (m.role === 'tool') {
      out.push({
        role: 'tool',
        tool_call_id: m.toolCallId ?? '',
        content: m.content,
      });
    }
  }

  return out;
}

function safeParse(raw: string | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw);
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export interface RunAgentResult {
  sessionId: string;
  title: string;
  messages: AgentMessage[];
  /** 本轮新增的工具调用记录 */
  toolLogs: Array<{
    id: string;
    toolName: string;
    status: 'success' | 'error';
    durationMs: number;
    error?: string | null;
  }>;
  steps: number;
  /** 模型是否支持 function calling（不支持时降级为纯对话） */
  toolsEnabled: boolean;
}

export async function runAgent(opts: {
  sessionId?: string;
  text: string;
}): Promise<RunAgentResult> {
  const text = opts.text.trim();
  if (!text) throw new Error('消息不能为空');

  const settings = readSettings();
  const baseURL = settings.lmStudio.baseUrl;
  const model = settings.lmStudio.model;

  const client = new OpenAI({
    baseURL,
    apiKey: process.env.LM_STUDIO_API_KEY || 'lm-studio',
    // LM Studio 本地服务，不需要重试风暴
    maxRetries: 0,
    timeout: 120_000,
  });

  /* ------------------------------ 会话准备 ------------------------------ */

  let session = opts.sessionId
    ? db.select().from(agentSession).where(eq(agentSession.id, opts.sessionId)).get()
    : undefined;

  const isNew = !session;
  if (!session) {
    session = db
      .insert(agentSession)
      .values({
        title: text.slice(0, 24) || '新会话',
        model,
      })
      .returning()
      .get();
  }

  const messages: AgentMessage[] = [...(session.messages ?? [])];
  messages.push({
    id: uuid(),
    role: 'user',
    content: text,
    createdAt: Date.now(),
  });

  /* ------------------------------- 主循环 ------------------------------- */

  const maxSteps = settings.lmStudio.maxSteps;
  const toolLogs: RunAgentResult['toolLogs'] = [];
  let toolsEnabled = true;
  let steps = 0;

  while (steps < maxSteps) {
    steps += 1;

    let completion: OpenAI.Chat.Completions.ChatCompletion;
    try {
      completion = await client.chat.completions.create({
        model,
        messages: toOpenAIMessages(messages, session.systemPrompt),
        ...(toolsEnabled
          ? { tools: TOOL_DEFINITIONS, tool_choice: 'auto' as const }
          : {}),
        temperature: settings.lmStudio.temperature,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // 模型不支持 tools → 关掉工具重试一次
      if (toolsEnabled && /tool|function|400/i.test(msg)) {
        toolsEnabled = false;
        steps -= 1;
        continue;
      }
      throw new Error(`调用 LM Studio 失败：${msg}`);
    }

    const choice = completion.choices?.[0]?.message;
    if (!choice) break;

    const toolCalls: AgentToolCall[] = (choice.tool_calls ?? [])
      .filter((tc) => tc.type === 'function')
      .map((tc) => ({
        id: tc.id,
        name: tc.function.name,
        arguments: tc.function.arguments ?? '{}',
      }));

    messages.push({
      id: uuid(),
      role: 'assistant',
      content: choice.content ?? '',
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      createdAt: Date.now(),
    });

    // 没有工具调用 → 模型给出最终回答，结束
    if (toolCalls.length === 0) break;

    for (const tc of toolCalls) {
      const started = Date.now();
      let resultText = '';
      let status: 'success' | 'error' = 'success';
      let errorMsg: string | null = null;

      try {
        const tool = TOOLS[tc.name];
        if (!tool) throw new Error(`未知工具：${tc.name}`);
        const args = safeParse(tc.arguments);
        const result = await tool.execute(args);
        resultText = typeof result === 'string' ? result : JSON.stringify(result);
      } catch (err) {
        status = 'error';
        errorMsg = err instanceof Error ? err.message : '工具执行失败';
        resultText = `工具执行失败：${errorMsg}`;
      }

      messages.push({
        id: uuid(),
        role: 'tool',
        content: resultText.slice(0, 8000),
        toolCallId: tc.id,
        toolName: tc.name,
        createdAt: Date.now(),
      });

      const log = db
        .insert(agentToolLog)
        .values({
          sessionId: session.id,
          stepIndex: steps,
          toolName: tc.name,
          args: safeParse(tc.arguments),
          result: resultText.slice(0, 4000),
          status,
          error: errorMsg,
          durationMs: Date.now() - started,
        })
        .returning()
        .get();

      toolLogs.push({
        id: log.id,
        toolName: log.toolName,
        status,
        durationMs: log.durationMs,
        error: errorMsg,
      });
    }
  }

  /* ------------------------------ 会话落库 ------------------------------ */

  const title = isNew ? text.slice(0, 24) || '新会话' : session.title;

  db.update(agentSession)
    .set({
      title,
      messages,
      messageCount: messages.length,
      lastMessageAt: new Date(),
      updatedAt: new Date(),
      model,
    })
    .where(eq(agentSession.id, session.id))
    .run();

  return {
    sessionId: session.id,
    title,
    messages,
    toolLogs,
    steps,
    toolsEnabled,
  };
}
