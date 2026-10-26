import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { collectResult } from '@/server/comfy/tasks';

/**
 * 收集任务结果并回填画布
 * POST /api/comfy/collect  { nodeId }
 *
 * 前端在 WS 收到「执行完成」后调用；幂等，重复调用不会重复建节点。
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { nodeId?: string };
    if (!body?.nodeId) {
      return NextResponse.json({ error: '缺少 nodeId' }, { status: 400 });
    }

    const result = await collectResult(body.nodeId);

    revalidatePath('/canvas');
    revalidatePath('/');

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error('[api/comfy/collect]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '收集失败' },
      { status: 500 },
    );
  }
}
