import { and, desc, eq, like, or, type SQL } from 'drizzle-orm';
import { db } from '@/db';
import { promptTemplates } from '@/db/schema';
import { ok } from '@/lib/http';
import { extractVariables } from '@/lib/utils';
import { promptTemplateCreateSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const keyword = searchParams.get('keyword')?.trim();
  const category = searchParams.get('category');

  const conds: SQL[] = [];
  if (keyword) {
    const kw = `%${keyword}%`;
    conds.push(
      or(
        like(promptTemplates.name, kw),
        like(promptTemplates.description, kw),
        like(promptTemplates.content, kw),
        like(promptTemplates.tags, kw),
      ) as SQL,
    );
  }
  if (category) conds.push(eq(promptTemplates.category, category));

  const rows = await db
    .select()
    .from(promptTemplates)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(promptTemplates.usageCount), desc(promptTemplates.updatedAt));

  return ok(rows);
}

export async function POST(req: Request) {
  const input = promptTemplateCreateSchema.parse(await req.json());

  const [row] = await db
    .insert(promptTemplates)
    .values({
      name: input.name,
      description: input.description ?? null,
      content: input.content,
      // 变量由正文自动解析，避免手动维护不一致
      variables: extractVariables(input.content),
      category: input.category ?? null,
      tags: input.tags ?? [],
      model: input.model ?? null,
    })
    .returning();

  return ok(row);
}
