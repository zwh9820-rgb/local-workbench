'use server';

/**
 * 日历日程 —— 服务端操作
 * events 表：startAt/endAt 存 timestamp_ms，allDay 标记全天。
 */
import { revalidatePath } from 'next/cache';
import { and, asc, eq, gte, lte } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import { events } from '@/db/schema';
import { dateKey } from '@/lib/utils';

const createInput = z.object({
  title: z.string().trim().min(1, '标题不能为空').max(200),
  description: z.string().max(5000).optional().nullable(),
  /** YYYY-MM-DD */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** HH:mm，全天可省略 */
  startTime: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
  endTime: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
  allDay: z.boolean().default(false),
  location: z.string().max(200).optional().nullable(),
});

/** 组合本地时间，避免 UTC 偏移 */
function toDate(date: string, time?: string | null, fallbackHour = 0): Date {
  const t = time && /^\d{2}:\d{2}$/.test(time) ? time : `${String(fallbackHour).padStart(2, '0')}:00`;
  return new Date(`${date}T${t}:00`);
}

export async function createEvent(raw: unknown) {
  const data = createInput.parse(raw);

  const startAt = data.allDay ? toDate(data.date, null, 0) : toDate(data.date, data.startTime, 9);
  const endAt =
    data.allDay
      ? new Date(`${data.date}T23:59:59`)
      : data.endTime
        ? toDate(data.date, data.endTime)
        : null;

  const row = db
    .insert(events)
    .values({
      title: data.title,
      description: data.description ?? null,
      startAt,
      endAt,
      allDay: data.allDay,
      location: data.location ?? null,
      kind: 'event',
    })
    .returning()
    .get();

  revalidatePath('/calendar');
  revalidatePath('/');
  return row;
}

export async function deleteEvent(id: string) {
  db.delete(events).where(eq(events.id, id)).run();
  revalidatePath('/calendar');
  revalidatePath('/');
  return { ok: true };
}

/** 读取某个月的事件（month 形如 2026-10） */
export async function listEventsByMonth(month: string) {
  const [y, m] = month.split('-').map(Number);
  const start = new Date(y, m - 1, 1, 0, 0, 0);
  const end = new Date(y, m, 0, 23, 59, 59, 999);

  return db
    .select()
    .from(events)
    .where(and(gte(events.startAt, start), lte(events.startAt, end)))
    .orderBy(asc(events.startAt))
    .all();
}

/** 今天的日程（总览页也在用） */
export async function listTodayEvents() {
  const key = dateKey();
  const start = new Date(`${key}T00:00:00`);
  const end = new Date(`${key}T23:59:59`);
  return db
    .select()
    .from(events)
    .where(and(gte(events.startAt, start), lte(events.startAt, end)))
    .orderBy(asc(events.startAt))
    .all();
}
