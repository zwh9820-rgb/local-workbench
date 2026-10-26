import { NextResponse } from 'next/server';
import { fetchLatestWorkflow, normalizeHost } from '@/server/comfy/client';
import { defaultComfyHost } from '@/server/settings';

/**
 * 抓取 ComfyUI 最近一次执行的工作流（API 格式）
 * GET /api/comfy/workflow?host=
 *
 * 说明：ComfyUI 没有「读取前端正在编辑的画布」的公开接口，
 * 实务上取 /history 里最近一条 prompt —— 即用户上一次点运行提交的那份，
 * 通常就是当前正在调的工作流。
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const host = normalizeHost(sp.get('host') || defaultComfyHost());

  try {
    const result = await fetchLatestWorkflow(host);
    if (!result) {
      return NextResponse.json(
        {
          error:
            'ComfyUI 里还没有执行记录。请先在 ComfyUI 里跑一次，或在节点里粘贴 API 格式工作流。',
        },
        { status: 404 },
      );
    }
    return NextResponse.json({
      ok: true,
      host,
      promptId: result.promptId,
      workflow: result.workflow,
    });
  } catch (err) {
    console.error('[api/comfy/workflow]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '抓取失败' },
      { status: 502 },
    );
  }
}
