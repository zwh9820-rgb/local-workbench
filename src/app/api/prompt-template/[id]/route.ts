import { eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { promptTemplates } from '@/db/schema';
import { fail, ok } from '@/lib/http';
import { extractVariables } from '@/lib/utils';
import { promptTemplateUpdateSchema } from '@/lib/validation';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const input = promptTemplateUpdateSchema.parse(await req.json());

  const [row] = await db
    .update(promptTemplates)
    .set({
      ...(input.name !== undefined && { name: input.name }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.content !== undefined && {
        content: input.content,
        variables: extractVariables(input.content),
      }),
      ...(input.category !== undefined && { category: input.category }),
      ...(input.tags !== undefined && { tags: input.tags }),
      ...(input.model !== undefined && { model: input.model }),
      updatedAt: new Date(),
    })
    .where(eq(promptTemplates.id, id))
    .returning();

  if (!row) return fail('模板不存在', 404);
  return ok(row);
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  await db.delete(promptTemplates).where(eq(promptTemplates.id, id));
  return ok({ deleted: true });
}

/** 记录一次使用（复制成品提示词时调用） */
export async function POST(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const [row] = await db
    .update(promptTemplates)
    .set({
      usageCount: sql`${promptTemplates.usageCount} + 1`,
      lastUsedAt: new Date(),
    })
    .where(eq(promptTemplates.id, id))
    .returning();
  if (!row) return fail('模板不存在', 404);
  return ok(row);
}
