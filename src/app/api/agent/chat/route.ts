import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { runAgent } from '@/server/agent/run';

/**
 * Agent 对话
 * POST /api/agent/chat  { sessionId?, text }
 *
 * 同步返回完整结果（含本轮所有工具调用）。LM Studio 本地推理，
 * 一轮带 1-2 次工具调用通常 5-20 秒。
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { sessionId?: string; text?: string };
    if (!body?.text?.trim()) {
      return NextResponse.json({ error: '消息不能为空' }, { status: 400 });
    }

    const result = await runAgent({
      sessionId: body.sessionId,
      text: body.text,
    });

    revalidatePath('/agent');
    revalidatePath('/');

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error('[api/agent/chat]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '对话失败' },
      { status: 500 },
    );
  }
}
