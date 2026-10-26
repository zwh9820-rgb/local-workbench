import { NextResponse } from 'next/server';
import { buildViewUrl, normalizeHost, type ComfyImageRef } from '@/server/comfy/client';

/**
 * ComfyUI 图片代理
 * GET /api/comfy/view?host=&filename=&subfolder=&type=
 *
 * 为什么要代理：
 *   1. 浏览器直接访问 http://127.0.0.1:8188 会被 CORS / 混合内容限制
 *   2. 支持多实例（host 参数区分）
 *   3. 统一加长缓存，画布重绘不重复拉图
 *
 * 安全：只允许回环与私有网段，避免被当成任意 URL 的 SSRF 跳板。
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isAllowedHost(rawHost: string): boolean {
  let u: URL;
  try {
    u = new URL(normalizeHost(rawHost));
  } catch {
    return false;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;

  const h = u.hostname;
  if (h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === '[::1]') return true;
  if (/^10\./.test(h)) return true;
  if (/^192\.168\./.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  return false;
}

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const host = sp.get('host') ?? 'http://127.0.0.1:8188';
  const filename = sp.get('filename');

  if (!filename) {
    return NextResponse.json({ error: '缺少 filename' }, { status: 400 });
  }
  if (!isAllowedHost(host)) {
    return NextResponse.json(
      { error: '只允许代理本机或局域网内的 ComfyUI 地址' },
      { status: 403 },
    );
  }

  const img: ComfyImageRef = {
    filename,
    subfolder: sp.get('subfolder') ?? '',
    type: sp.get('type') ?? 'output',
  };

  try {
    const upstream = await fetch(buildViewUrl(host, img), {
      signal: AbortSignal.timeout(30_000),
      cache: 'no-store',
    });

    if (!upstream.ok) {
      return NextResponse.json(
        { error: `ComfyUI 返回 ${upstream.status}` },
        { status: upstream.status },
      );
    }

    const buf = Buffer.from(await upstream.arrayBuffer());
    const contentType = upstream.headers.get('content-type') ?? 'image/png';

    return new Response(new Uint8Array(buf), {
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(buf.length),
        // 文件名唯一，可长期缓存
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (err) {
    console.error('[api/comfy/view]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '取图失败' },
      { status: 502 },
    );
  }
}
