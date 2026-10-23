import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { db } from '@/db';
import {
  agentSession,
  aiHot,
  clipboardSnapshots,
  dailyReview,
  events,
  inspiration,
  promptTemplates,
  todoItems,
} from '@/db/schema';
import { endOfDay, endOfWeek, startOfDay, startOfWeek, toDateKey, todayKey } from '@/lib/date';
import { ok } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 总览页聚合数据（一次请求拿全，避免首页多请求瀑布） */
export async function GET() {
  const today = todayKey();
  const dayStart = startOfDay(new Date());
  const dayEnd = endOfDay(new Date());
  const weekStart = startOfWeek(new Date());
  const weekEnd = endOfWeek(new Date());

  const [
    todayTodos,
    weekTodos,
    todayEvents,
    inspirationRows,
    recentHot,
    todayReview,
    clipboardCount,
    templateCount,
    sessions,
    sessionCount,
  ] = await Promise.all([
    db
      .select()
      .from(todoItems)
      .where(eq(todoItems.planDate, today))
      .orderBy(todoItems.sortOrder),
    db
      .select()
      .from(todoItems)
      .where(
        and(
          gte(todoItems.planDate, toDateKey(weekStart)),
          lte(todoItems.planDate, toDateKey(weekEnd)),
        ),
      )
      .orderBy(todoItems.sortOrder),
    db
      .select()
      .from(events)
      .where(and(gte(events.startAt, dayStart), lte(events.startAt, dayEnd)))
      .orderBy(events.startAt),
    db
      .select({
        status: inspiration.status,
        count: sql<number>`count(*)`,
      })
      .from(inspiration)
      .groupBy(inspiration.status),
    db.select().from(aiHot).orderBy(desc(aiHot.heat), desc(aiHot.createdAt)).limit(4),
    db.select().from(dailyReview).where(eq(dailyReview.reviewDate, today)).limit(1),
    db.select({ count: sql<number>`count(*)` }).from(clipboardSnapshots),
    db.select({ count: sql<number>`count(*)` }).from(promptTemplates),
    db.select().from(agentSession).orderBy(desc(agentSession.updatedAt)).limit(4),
    db.select({ count: sql<number>`count(*)` }).from(agentSession),
  ]);

  const recentInspiration = await db
    .select()
    .from(inspiration)
    .orderBy(desc(inspiration.updatedAt))
    .limit(5);

  const inspirationStats = {
    ongoing: 0,
    paused: 0,
    finished: 0,
    abandoned: 0,
  } as Record<string, number>;
  inspirationRows.forEach((r) => {
    inspirationStats[r.status] = Number(r.count);
  });
  const inspirationTotal = Object.values(inspirationStats).reduce((a, b) => a + b, 0);

  const doneToday = todayTodos.filter((t) => t.status === 'done').length;
  const doneWeek = weekTodos.filter((t) => t.status === 'done').length;

  return ok({
    today,
    todo: {
      todayTotal: todayTodos.length,
      todayDone: doneToday,
      weekTotal: weekTodos.length,
      weekDone: doneWeek,
      todayPending: todayTodos.filter((t) => t.status !== 'done').slice(0, 6),
      weekPending: weekTodos.filter((t) => t.status !== 'done').slice(0, 6),
    },
    events: todayEvents,
    inspiration: {
      ...inspirationStats,
      total: inspirationTotal,
      recent: recentInspiration,
    },
    aiHot: recentHot,
    review: todayReview[0] ?? null,
    clipboardCount: Number(clipboardCount[0]?.count ?? 0),
    templateCount: Number(templateCount[0]?.count ?? 0),
    agent: {
      total: Number(sessionCount[0]?.count ?? 0),
      recent: sessions,
    },
  });
}
