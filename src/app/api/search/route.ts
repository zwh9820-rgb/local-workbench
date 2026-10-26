import { NextResponse } from 'next/server';
import { searchAll } from '@/server/search';

/** 全局搜索：GET /api/search?q=xxx */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get('q') ?? '';

  if (q.trim().length < 1) {
    return NextResponse.json({ query: q, hits: [], fuzzy: false });
  }

  try {
    return NextResponse.json(searchAll(q));
  } catch (err) {
    console.error('[api/search]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '搜索失败' },
      { status: 500 },
    );
  }
}
