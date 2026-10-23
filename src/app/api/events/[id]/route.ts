import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { events } from '@/db/schema';
import { fail, ok } from '@/lib/http';
import { eventUpdateSchema } from '@/lib/validation';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const input = eventUpdateSchema.parse(await req.json());

  const [row] = await db
    .update(events)
    .set({
      ...(input.title !== undefined && { title: input.title }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.startAt !== undefined && { startAt: new Date(input.startAt) }),
      ...(input.endAt !== undefined && { endAt: input.endAt ? new Date(input.endAt) : null }),
      ...(input.allDay !== undefined && { allDay: input.allDay }),
      ...(input.location !== undefined && { location: input.location }),
      ...(input.category !== undefined && { category: input.category }),
      ...(input.tags !== undefined && { tags: input.tags }),
      ...(input.remindAt !== undefined && {
        remindAt: input.remindAt ? new Date(input.remindAt) : null,
      }),
      ...(input.isDone !== undefined && { isDone: input.isDone }),
      updatedAt: new Date(),
    })
    .where(eq(events.id, id))
    .returning();

  if (!row) return fail('日程不存在', 404);
  return ok(row);
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  await db.delete(events).where(eq(events.id, id));
  return ok({ deleted: true });
}
