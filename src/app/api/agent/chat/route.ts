import { NextResponse } from 'next/server';
import { streamAgent } from '@/server/agent/run';

/**
 * Agent 对话（SSE 流式）
 * POST /api/agent/chat  { sessionId?, text }
 *
 * 响应为 text/event-stream，每帧一个 JSON：
 *   { type: 'delta', text }                       文本增量
 *   { type: 'tool_start', name, label }           工具开始
 *   { type: 'tool_end', name, label, status, ... } 工具结束
 *   { type: 'done', sessionId, messages, ... }    最终结果
 *   { type: 'error', message }                    出错
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(req: Request) {
  let body: { sessionId?: string; text?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: '请求体格式错误' }, { status: 400 });
  }

  if (!body?.text?.trim()) {
    return NextResponse.json({ error: '消息不能为空' }, { status: 400 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      try {
        for await (const event of streamAgent({
          sessionId: body.sessionId,
          text: body.text!,
        })) {
          send(event);
        }
      } catch (err) {
        console.error('[api/agent/chat]', err);
        send({
          type: 'error',
          message: err instanceof Error ? err.message : '对话失败',
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // 关掉 Nginx / 反代的缓冲，保证逐帧到达
      'X-Accel-Buffering': 'no',
    },
  });
}
