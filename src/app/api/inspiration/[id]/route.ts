import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { inspiration } from '@/db/schema';
import { fail, ok } from '@/lib/http';
import { inspirationUpdateSchema } from '@/lib/validation';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const [row] = await db.select().from(inspiration).where(eq(inspiration.id, id)).limit(1);
  if (!row) return fail('灵感不存在', 404);
  return ok(row);
}

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const input = inspirationUpdateSchema.parse(await req.json());

  const [row] = await db
    .update(inspiration)
    .set({
      ...(input.title !== undefined && { title: input.title }),
      ...(input.summary !== undefined && { summary: input.summary }),
      ...(input.content !== undefined && { content: input.content }),
      ...(input.type !== undefined && { type: input.type }),
      ...(input.status !== undefined && { status: input.status }),
      ...(input.progress !== undefined && { progress: input.progress }),
      ...(input.tags !== undefined && { tags: input.tags }),
      ...(input.localPath !== undefined && { localPath: input.localPath }),
      ...(input.coverImage !== undefined && { coverImage: input.coverImage }),
      ...(input.isFavorite !== undefined && { isFavorite: input.isFavorite }),
      updatedAt: new Date(),
    })
    .where(eq(inspiration.id, id))
    .returning();

  if (!row) return fail('灵感不存在', 404);
  return ok(row);
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  await db.delete(inspiration).where(eq(inspiration.id, id));
  return ok({ deleted: true });
}
