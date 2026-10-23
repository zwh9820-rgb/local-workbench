import { and, asc, eq, gte, lte, type SQL } from 'drizzle-orm';
import { db } from '@/db';
import { todoItems } from '@/db/schema';
import { getWeekKey, fromDateKey, todayKey, toDateKey, startOfWeek, endOfWeek } from '@/lib/date';
import { ok } from '@/lib/http';
import { todoCreateSchema, todoQuerySchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 待办列表
 * ?scope=today|week|all
 * ?date=YYYY-MM-DD  （scope=today 时指定某天）
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = todoQuerySchema.parse(Object.fromEntries(searchParams));

  const conds: SQL[] = [];

  if (q.scope === 'today') {
    conds.push(eq(todoItems.planDate, q.date ?? todayKey()));
  } else if (q.scope === 'week') {
    const base = q.date ? fromDateKey(q.date) : new Date();
    conds.push(gte(todoItems.planDate, toDateKey(startOfWeek(base))));
    conds.push(lte(todoItems.planDate, toDateKey(endOfWeek(base))));
  }

  if (q.status) conds.push(eq(todoItems.status, q.status));

  const rows = await db
    .select()
    .from(todoItems)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(asc(todoItems.status), asc(todoItems.sortOrder), asc(todoItems.createdAt));

  return ok(rows);
}

/** 新建待办：weekKey 由 planDate 推导，保证「今日/本周」口径一致 */
export async function POST(req: Request) {
  const input = todoCreateSchema.parse(await req.json());

  const [row] = await db
    .insert(todoItems)
    .values({
      title: input.title,
      note: input.note ?? null,
      status: input.status,
      priority: input.priority,
      planDate: input.planDate,
      weekKey: getWeekKey(fromDateKey(input.planDate)),
      dueDate: input.dueDate ?? null,
      tags: input.tags ?? [],
      source: input.source ?? 'manual',
      estimateMin: input.estimateMin ?? null,
      sortOrder: input.sortOrder ?? Date.now() % 100000,
      completedAt: input.status === 'done' ? new Date() : null,
    })
    .returning();

  return ok(row);
}
