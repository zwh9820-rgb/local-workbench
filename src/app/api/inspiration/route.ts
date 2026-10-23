import { and, desc, eq, like, or, type SQL } from 'drizzle-orm';
import { db } from '@/db';
import { inspiration } from '@/db/schema';
import { ok } from '@/lib/http';
import { inspirationCreateSchema, inspirationQuerySchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 列表：关键词 / 状态 / 类型 / 标签 / 收藏 筛选 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = inspirationQuerySchema.parse(Object.fromEntries(searchParams));

  const conds: SQL[] = [];
  if (q.keyword) {
    const kw = `%${q.keyword}%`;
    conds.push(
      or(
        like(inspiration.title, kw),
        like(inspiration.summary, kw),
        like(inspiration.content, kw),
        like(inspiration.tags, kw),
      ) as SQL,
    );
  }
  if (q.status) conds.push(eq(inspiration.status, q.status));
  if (q.type) conds.push(eq(inspiration.type, q.type));
  if (q.tag) conds.push(like(inspiration.tags, `%${q.tag}%`));
  if (q.favorite === 'true') conds.push(eq(inspiration.isFavorite, true));

  const rows = await db
    .select()
    .from(inspiration)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(inspiration.isFavorite), desc(inspiration.updatedAt))
    .limit(q.limit ?? 300);

  return ok(rows);
}

/** 新建 */
export async function POST(req: Request) {
  const input = inspirationCreateSchema.parse(await req.json());

  const [row] = await db
    .insert(inspiration)
    .values({
      title: input.title,
      summary: input.summary ?? null,
      content: input.content ?? '',
      type: input.type,
      status: input.status,
      progress: input.progress,
      tags: input.tags ?? [],
      localPath: input.localPath ?? null,
      coverImage: input.coverImage ?? null,
      isFavorite: input.isFavorite ?? false,
    })
    .returning();

  return ok(row);
}
