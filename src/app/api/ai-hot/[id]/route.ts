import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { aiHot } from '@/db/schema';
import { fail, ok } from '@/lib/http';
import { aiHotUpdateSchema } from '@/lib/validation';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const input = aiHotUpdateSchema.parse(await req.json());

  const [row] = await db
    .update(aiHot)
    .set({
      ...(input.title !== undefined && { title: input.title }),
      ...(input.summary !== undefined && { summary: input.summary }),
      ...(input.content !== undefined && { content: input.content }),
      ...(input.source !== undefined && { source: input.source }),
      ...(input.sourceUrl !== undefined && { sourceUrl: input.sourceUrl }),
      ...(input.category !== undefined && { category: input.category }),
      ...(input.tags !== undefined && { tags: input.tags }),
      ...(input.heat !== undefined && { heat: input.heat }),
      ...(input.publishedAt !== undefined && {
        publishedAt: input.publishedAt ? new Date(input.publishedAt) : null,
      }),
      ...(input.isStarred !== undefined && { isStarred: input.isStarred }),
      updatedAt: new Date(),
    })
    .where(eq(aiHot.id, id))
    .returning();

  if (!row) return fail('记录不存在', 404);
  return ok(row);
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  await db.delete(aiHot).where(eq(aiHot.id, id));
  return ok({ deleted: true });
}
