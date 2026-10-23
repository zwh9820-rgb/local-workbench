import { desc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { dailyReview } from '@/db/schema';
import { todayKey } from '@/lib/date';
import { ok } from '@/lib/http';
import { reviewUpsertSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/review?date=YYYY-MM-DD   取某天复盘（不存在返回 null）
 * GET /api/review?limit=20          取最近若干条
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const date = searchParams.get('date');

  if (date) {
    const [row] = await db
      .select()
      .from(dailyReview)
      .where(eq(dailyReview.reviewDate, date))
      .limit(1);
    return ok(row ?? null);
  }

  const limit = Math.min(Number(searchParams.get('limit') ?? 20) || 20, 100);
  const rows = await db
    .select()
    .from(dailyReview)
    .orderBy(desc(dailyReview.reviewDate))
    .limit(limit);
  return ok(rows);
}

/** 保存复盘：按日期 upsert，一天一条 */
export async function POST(req: Request) {
  const input = reviewUpsertSchema.parse(await req.json());

  const [row] = await db
    .insert(dailyReview)
    .values({
      reviewDate: input.reviewDate ?? todayKey(),
      summary: input.summary ?? null,
      wellDone: input.wellDone ?? null,
      problems: input.problems ?? null,
      improvements: input.improvements ?? null,
      tomorrowPlan: input.tomorrowPlan ?? null,
      content: input.content ?? '',
      moodScore: input.moodScore ?? null,
      energyScore: input.energyScore ?? null,
      tags: input.tags ?? [],
    })
    .onConflictDoUpdate({
      target: dailyReview.reviewDate,
      set: {
        summary: input.summary ?? null,
        wellDone: input.wellDone ?? null,
        problems: input.problems ?? null,
        improvements: input.improvements ?? null,
        tomorrowPlan: input.tomorrowPlan ?? null,
        content: input.content ?? '',
        moodScore: input.moodScore ?? null,
        energyScore: input.energyScore ?? null,
        tags: input.tags ?? [],
        updatedAt: new Date(),
      },
    })
    .returning();

  return ok(row);
}
