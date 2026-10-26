import { NextResponse } from 'next/server';
import { ping } from '@/server/comfy/client';
import { defaultComfyHost } from '@/server/settings';

/**
 * ComfyUI 连通性检查
 * GET /api/comfy/ping?host=
 * 设置页「测试连接」按钮用。
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const host = sp.get('host') || defaultComfyHost();
  const result = await ping(host);
  return NextResponse.json({ host, ...result });
}
