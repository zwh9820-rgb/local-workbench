import { and, desc, eq, like, or, type SQL } from 'drizzle-orm';
import { db } from '@/db';
import { aiHot } from '@/db/schema';
import { ok } from '@/lib/http';
import { aiHotCreateSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const keyword = searchParams.get('keyword')?.trim();
  const starred = searchParams.get('starred');
  const limit = Math.min(Number(searchParams.get('limit') ?? 100) || 100, 300);

  const conds: SQL[] = [];
  if (keyword) {
    const kw = `%${keyword}%`;
    conds.push(
      or(like(aiHot.title, kw), like(aiHot.summary, kw), like(aiHot.content, kw)) as SQL,
    );
  }
  if (starred === 'true') conds.push(eq(aiHot.isStarred, true));

  const rows = await db
    .select()
    .from(aiHot)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(aiHot.isStarred), desc(aiHot.heat), desc(aiHot.createdAt))
    .limit(limit);

  return ok(rows);
}

export async function POST(req: Request) {
  const input = aiHotCreateSchema.parse(await req.json());

  const [row] = await db
    .insert(aiHot)
    .values({
      title: input.title,
      summary: input.summary ?? null,
      content: input.content ?? '',
      source: input.source ?? null,
      sourceUrl: input.sourceUrl ?? null,
      category: input.category ?? null,
      tags: input.tags ?? [],
      heat: input.heat,
      publishedAt: input.publishedAt ? new Date(input.publishedAt) : null,
      isStarred: input.isStarred ?? false,
    })
    .returning();

  return ok(row);
}
