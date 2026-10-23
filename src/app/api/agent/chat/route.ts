import { fail, ok, toErrorResponse } from '@/lib/http';
import { runAgent } from '@/lib/agent/loop';
import { agentChatSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * Agent 对话入口（非流式，一次性返回）
 * 前端拿到结果后直接渲染 assistant 文本 + tool 执行记录。
 *
 * 错误统一转成 { ok:false, error } 结构，前端能直接展示可读提示，
 * 例如「无法连接 LM Studio」而不是裸的 500。
 */
export async function POST(req: Request) {
  try {
    const input = agentChatSchema.parse(await req.json());

    const result = await runAgent({
      sessionId: input.sessionId,
      userMessage: input.message,
      mode: input.mode,
      model: input.model,
      selectedText: input.selectedText,
    });

    return ok({
      sessionId: result.session.id,
      title: result.session.title,
      model: result.model,
      messages: result.session.messages,
      assistantText: result.assistantMessage.content,
      toolExecutions: result.toolExecutions.map((t) => ({
        toolName: t.toolName,
        args: t.args,
        status: t.status,
        error: t.error,
        durationMs: t.durationMs,
        content: t.content,
      })),
      steps: result.steps,
    });
  } catch (err) {
    // 模型服务不可用属于「环境问题」，用 502 更语义化
    if (err instanceof Error && /LM Studio|Agent 调用失败/.test(err.message)) {
      return fail(err.message, 502);
    }
    return toErrorResponse(err);
  }
}
