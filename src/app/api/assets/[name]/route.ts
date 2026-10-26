import { NextResponse } from 'next/server';
import { readAsset, removeAsset } from '@/server/assets';

/**
 * 读取本地素材
 * GET /api/assets/<filename>
 *
 * 文件名走白名单校验（只允许字母数字点横线），杜绝路径穿越。
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;
  const asset = readAsset(name);

  if (!asset) {
    return NextResponse.json({ error: '素材不存在' }, { status: 404 });
  }

  return new Response(new Uint8Array(asset.buffer), {
    headers: {
      'Content-Type': asset.mime,
      'Content-Length': String(asset.buffer.length),
      // 文件名带随机串，可长期缓存
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}

/** 删除素材（同时清理索引） */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;
  const ok = removeAsset(name);
  if (!ok) {
    return NextResponse.json({ error: '素材不存在' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
