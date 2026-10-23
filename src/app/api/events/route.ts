import { and, asc, gte, lte, type SQL } from 'drizzle-orm';
import { db } from '@/db';
import { events } from '@/db/schema';
import { endOfDay, fromDateKey, startOfDay, toDateKey } from '@/lib/date';
import { ok } from '@/lib/http';
import { eventCreateSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 日程列表
 * ?date=YYYY-MM-DD  当天
 * ?from=YYYY-MM-DD&to=YYYY-MM-DD  区间（月视图用）
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const date = searchParams.get('date');
  const from = searchParams.get('from');
  const to = searchParams.get('to');

  const conds: SQL[] = [];
  if (date) {
    conds.push(gte(events.startAt, startOfDay(fromDateKey(date))));
    conds.push(lte(events.startAt, endOfDay(fromDateKey(date))));
  } else if (from && to) {
    conds.push(gte(events.startAt, startOfDay(fromDateKey(from))));
    conds.push(lte(events.startAt, endOfDay(fromDateKey(to))));
  }

  const rows = await db
    .select()
    .from(events)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(asc(events.startAt));

  return ok(rows);
}

export async function POST(req: Request) {
  const input = eventCreateSchema.parse(await req.json());

  const [row] = await db
    .insert(events)
    .values({
      title: input.title,
      description: input.description ?? null,
      startAt: new Date(input.startAt),
      endAt: input.endAt ? new Date(input.endAt) : null,
      allDay: input.allDay ?? false,
      location: input.location ?? null,
      category: input.category ?? null,
      tags: input.tags ?? [],
      remindAt: input.remindAt ? new Date(input.remindAt) : null,
      isDone: input.isDone ?? false,
    })
    .returning();

  return ok({ ...row, dateKey: toDateKey(new Date(row.startAt)) });
}
