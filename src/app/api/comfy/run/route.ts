import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { runComfyNode } from '@/server/comfy/tasks';

/**
 * 提交 ComfyUI 任务
 * POST /api/comfy/run  { nodeId, values?, clientId? }
 *
 * 注意：这是唯一会真正把任务推进 ComfyUI 队列的入口，
 * 只允许人工点击触发（Agent 不调用此接口）。
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      nodeId?: string;
      values?: Record<string, string>;
      clientId?: string;
    };

    if (!body?.nodeId) {
      return NextResponse.json({ error: '缺少 nodeId' }, { status: 400 });
    }

    const result = await runComfyNode(body.nodeId, {
      values: body.values,
      clientId: body.clientId,
    });

    revalidatePath(`/canvas`);
    revalidatePath('/');

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error('[api/comfy/run]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '提交失败' },
      { status: 500 },
    );
  }
}
