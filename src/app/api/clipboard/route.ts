import { desc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { clipboardSnapshots } from '@/db/schema';
import { ok } from '@/lib/http';
import { clipboardCreateSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 列表：默认取最近 100 条 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const limit = Math.min(Number(searchParams.get('limit') ?? 100) || 100, 500);

  const rows = await db
    .select()
    .from(clipboardSnapshots)
    .orderBy(desc(clipboardSnapshots.isPinned), desc(clipboardSnapshots.createdAt))
    .limit(limit);

  return ok(rows);
}

/** 新建快照：与上一条内容相同则去重，避免重复刷屏 */
export async function POST(req: Request) {
  const body = clipboardCreateSchema.parse(await req.json());
  const content = body.content.trim();
  if (!content) return ok(null);

  const [latest] = await db
    .select()
    .from(clipboardSnapshots)
    .orderBy(desc(clipboardSnapshots.createdAt))
    .limit(1);

  if (latest && latest.content === content) {
    return ok(latest);
  }

  // 简单类型推断，方便前端分类展示
  const contentType =
    body.contentType ??
    (/^https?:\/\//i.test(content)
      ? 'url'
      : /```|^\s*[{[<]/.test(content)
        ? 'code'
        : /[#*`>-]\s/.test(content)
          ? 'markdown'
          : 'text');

  const [row] = await db
    .insert(clipboardSnapshots)
    .values({
      content,
      contentType,
      sourceApp: body.sourceApp ?? '本机复制',
      charCount: content.length,
    })
    .returning();

  return ok(row);
}

/** 清空（保留 pinned） */
export async function DELETE() {
  await db.delete(clipboardSnapshots).where(eq(clipboardSnapshots.isPinned, false));
  return ok({ cleared: true });
}
