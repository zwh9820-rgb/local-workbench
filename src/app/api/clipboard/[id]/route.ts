import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { clipboardSnapshots } from '@/db/schema';
import { fail, ok } from '@/lib/http';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

/** 置顶 / 取消置顶 */
export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const body = (await req.json()) as { isPinned?: boolean };

  const [row] = await db
    .update(clipboardSnapshots)
    .set({ isPinned: body.isPinned ?? false })
    .where(eq(clipboardSnapshots.id, id))
    .returning();

  if (!row) return fail('快照不存在', 404);
  return ok(row);
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  await db.delete(clipboardSnapshots).where(eq(clipboardSnapshots.id, id));
  return ok({ deleted: true });
}
