'use server';

/**
 * 每日复盘 —— 服务端操作
 * 一天一条（review_date 唯一），保存时存在则更新、不存在则新建。
 */
import { revalidatePath } from 'next/cache';
import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import { dailyReview } from '@/db/schema';

const saveInput = z.object({
  reviewDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式应为 YYYY-MM-DD'),
  content: z.string().max(200_000).default(''),
  summary: z.string().max(500).optional().nullable(),
  mood: z.enum(['great', 'ok', 'bad']).optional().nullable(),
  score: z.number().int().min(0).max(10).optional().nullable(),
});

export async function saveReview(raw: unknown) {
  const data = saveInput.parse(raw);

  const existing = db
    .select()
    .from(dailyReview)
    .where(eq(dailyReview.reviewDate, data.reviewDate))
    .get();

  if (existing) {
    const row = db
      .update(dailyReview)
      .set({
        content: data.content,
        summary: data.summary ?? null,
        mood: data.mood ?? null,
        score: data.score ?? null,
        updatedAt: new Date(),
      })
      .where(eq(dailyReview.id, existing.id))
      .returning()
      .get();

    revalidatePath('/review');
    revalidatePath('/');
    return row;
  }

  const row = db
    .insert(dailyReview)
    .values({
      reviewDate: data.reviewDate,
      content: data.content,
      summary: data.summary ?? null,
      mood: data.mood ?? null,
      score: data.score ?? null,
    })
    .returning()
    .get();

  revalidatePath('/review');
  revalidatePath('/');
  return row;
}

export async function getReviewByDate(date: string) {
  return db.select().from(dailyReview).where(eq(dailyReview.reviewDate, date)).get();
}

/** 最近 N 天复盘（右侧历史列表用） */
export async function listRecentReviews(limit = 30) {
  return db
    .select({
      id: dailyReview.id,
      reviewDate: dailyReview.reviewDate,
      summary: dailyReview.summary,
      mood: dailyReview.mood,
      updatedAt: dailyReview.updatedAt,
    })
    .from(dailyReview)
    .orderBy(desc(dailyReview.reviewDate))
    .limit(limit)
    .all();
}
