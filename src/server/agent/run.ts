/**
 * Agent 主循环（流式版）
 * ----------------------------------------------------------------------------
 * 用 OpenAI SDK 连接本地 LM Studio，原生 function calling + SSE 流式输出。
 *
 * 流式下的两个难点：
 *   1. 文本增量（delta.content）可以直接转发，边生成边显示；
 *   2. 工具调用参数是分片返回的（delta.tool_calls[i].function.arguments 逐字符追加），
 *      必须按 index 累积完整 JSON 后才能执行，执行完再进入下一轮。
 *
 * 对外暴露 async generator，route 层转成 SSE。
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
import { AGENT_TOOL_LABELS } from '@/lib/constants';
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

/* ------------------------------ 事件定义 ------------------------------- */

export type AgentStreamEvent =
  | { type: 'delta'; text: string }
  | { type: 'tool_start'; name: string; label: string }
  | {
      type: 'tool_end';
      name: string;
      label: string;
      status: 'success' | 'error';
      durationMs: number;
      error?: string;
    }
  | {
      type: 'done';
      sessionId: string;
      title: string;
      messages: AgentMessage[];
      toolLogs: Array<{
        id: string;
        toolName: string;
        status: 'success' | 'error';
        durationMs: number;
        error?: string | null;
      }>;
      steps: number;
      toolsEnabled: boolean;
    }
  | { type: 'error'; message: string };

/* ------------------------------ 内部工具 ------------------------------- */

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

/* -------------------------------- 主流程 -------------------------------- */

export async function* streamAgent(opts: {
  sessionId?: string;
  text: string;
}): AsyncGenerator<AgentStreamEvent> {
  const text = opts.text.trim();
  if (!text) {
    yield { type: 'error', message: '消息不能为空' };
    return;
  }

  const settings = readSettings();
  const baseURL = settings.lmStudio.baseUrl;
  const model = settings.lmStudio.model;

  const client = new OpenAI({
    baseURL,
    apiKey: process.env.LM_STUDIO_API_KEY || 'lm-studio',
    maxRetries: 0,
    timeout: 180_000,
  });

  /* ------------------------------ 会话准备 ------------------------------ */

  let session = opts.sessionId
    ? db.select().from(agentSession).where(eq(agentSession.id, opts.sessionId)).get()
    : undefined;

  const isNew = !session;
  if (!session) {
    session = db
      .insert(agentSession)
      .values({ title: text.slice(0, 24) || '新会话', model })
      .returning()
      .get();
  }

  const messages: AgentMessage[] = [...(session.messages ?? [])];
  messages.push({ id: uuid(), role: 'user', content: text, createdAt: Date.now() });

  /* ------------------------------- 主循环 ------------------------------- */

  const maxSteps = settings.lmStudio.maxSteps;
  const toolLogs: Array<{
    id: string;
    toolName: string;
    status: 'success' | 'error';
    durationMs: number;
    error?: string | null;
  }> = [];

  let toolsEnabled = true;
  let steps = 0;

  try {
    while (steps < maxSteps) {
      steps += 1;

      let stream: AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>;
      try {
        stream = await client.chat.completions.create({
          model,
          messages: toOpenAIMessages(messages, session.systemPrompt),
          ...(toolsEnabled
            ? { tools: TOOL_DEFINITIONS, tool_choice: 'auto' as const }
            : {}),
          temperature: settings.lmStudio.temperature,
          stream: true,
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

      let content = '';
      const toolAcc = new Map<number, { id: string; name: string; args: string }>();

      for await (const chunk of stream) {
        const delta = chunk.choices?.[0]?.delta;
        if (!delta) continue;

        if (delta.content) {
          content += delta.content;
          yield { type: 'delta', text: delta.content };
        }

        // 工具调用分片累积
        if (delta.tool_calls?.length) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index ?? 0;
            const cur = toolAcc.get(idx) ?? { id: '', name: '', args: '' };
            if (tc.id) cur.id = tc.id;
            if (tc.function?.name) cur.name += tc.function.name;
            if (tc.function?.arguments) cur.args += tc.function.arguments;
            toolAcc.set(idx, cur);
          }
        }
      }

      const toolCalls: AgentToolCall[] = [...toolAcc.values()]
        .filter((t) => t.name)
        .map((t) => ({
          id: t.id || `call_${uuid().slice(0, 8)}`,
          name: t.name,
          arguments: t.args || '{}',
        }));

      messages.push({
        id: uuid(),
        role: 'assistant',
        content,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        createdAt: Date.now(),
      });

      // 没有工具调用 → 本轮就是最终回答
      if (toolCalls.length === 0) break;

      /* --------------------------- 逐个执行工具 --------------------------- */

      for (const tc of toolCalls) {
        const label = AGENT_TOOL_LABELS[tc.name] ?? tc.name;
        yield { type: 'tool_start', name: tc.name, label };

        const started = Date.now();
        let resultText = '';
        let status: 'success' | 'error' = 'success';
        let errorMsg: string | null = null;

        try {
          const tool = TOOLS[tc.name];
          if (!tool) throw new Error(`未知工具：${tc.name}`);
          const result = await tool.execute(safeParse(tc.arguments));
          resultText = typeof result === 'string' ? result : JSON.stringify(result);
        } catch (err) {
          status = 'error';
          errorMsg = err instanceof Error ? err.message : '工具执行失败';
          resultText = `工具执行失败：${errorMsg}`;
        }

        const durationMs = Date.now() - started;

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
            durationMs,
          })
          .returning()
          .get();

        toolLogs.push({
          id: log.id,
          toolName: log.toolName,
          status,
          durationMs,
          error: errorMsg,
        });

        yield {
          type: 'tool_end',
          name: tc.name,
          label,
          status,
          durationMs,
          error: errorMsg ?? undefined,
        };
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : '对话失败';

    // 即使中途失败，也要把已有的消息存下来，避免用户白等
    db.update(agentSession)
      .set({
        messages,
        messageCount: messages.length,
        lastMessageAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(agentSession.id, session.id))
      .run();

    yield { type: 'error', message };
    return;
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

  yield {
    type: 'done',
    sessionId: session.id,
    title,
    messages,
    toolLogs,
    steps,
    toolsEnabled,
  };
}
