import { NextResponse } from 'next/server';
import { updateNodeProgress } from '@/server/comfy/tasks';

/**
 * 进度落库（前端 WS 收到 progress 后节流上报）
 * POST /api/comfy/progress  { nodeId, progress }
 *
 * 只更新 meta.status/progress，不动其它字段，开销很小。
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { nodeId?: string; progress?: number };
    if (!body?.nodeId || typeof body.progress !== 'number') {
      return NextResponse.json({ error: '参数不完整' }, { status: 400 });
    }
    updateNodeProgress(body.nodeId, body.progress);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '更新失败' },
      { status: 500 },
    );
  }
}
