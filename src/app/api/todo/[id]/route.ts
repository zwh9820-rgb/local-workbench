import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { todoItems } from '@/db/schema';
import { fromDateKey, getWeekKey } from '@/lib/date';
import { fail, ok } from '@/lib/http';
import { todoUpdateSchema } from '@/lib/validation';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const input = todoUpdateSchema.parse(await req.json());

  const patch: Record<string, unknown> = { updatedAt: new Date() };

  if (input.title !== undefined) patch.title = input.title;
  if (input.note !== undefined) patch.note = input.note;
  if (input.priority !== undefined) patch.priority = input.priority;
  if (input.dueDate !== undefined) patch.dueDate = input.dueDate;
  if (input.tags !== undefined) patch.tags = input.tags;
  if (input.estimateMin !== undefined) patch.estimateMin = input.estimateMin;
  if (input.sortOrder !== undefined) patch.sortOrder = input.sortOrder;

  if (input.planDate !== undefined) {
    patch.planDate = input.planDate;
    patch.weekKey = getWeekKey(fromDateKey(input.planDate));
  }

  // 勾选完成时写入 completedAt，取消完成时清空
  if (input.status !== undefined) {
    patch.status = input.status;
    patch.completedAt = input.status === 'done' ? new Date() : null;
  }

  const [row] = await db
    .update(todoItems)
    .set(patch)
    .where(eq(todoItems.id, id))
    .returning();

  if (!row) return fail('待办不存在', 404);
  return ok(row);
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  await db.delete(todoItems).where(eq(todoItems.id, id));
  return ok({ deleted: true });
}
