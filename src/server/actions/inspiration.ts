'use server';

/**
 * 灵感素材库 —— 服务端操作
 */
import { revalidatePath } from 'next/cache';
import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import { inspiration } from '@/db/schema';

const statusEnum = z.enum(['ongoing', 'paused', 'finished', 'abandoned']);
const typeEnum = z.enum(['idea', 'prompt', 'script', 'fragment', 'project', 'note']);

const createInput = z.object({
  title: z.string().trim().min(1, '标题不能为空').max(200),
  content: z.string().max(100_000).default(''),
  type: typeEnum.default('idea'),
  status: statusEnum.default('ongoing'),
  progress: z.number().int().min(0).max(100).default(0),
  tags: z.array(z.string()).default([]),
  source: z.string().max(500).optional().nullable(),
});

const updateInput = createInput.partial().extend({
  pinned: z.boolean().optional(),
  canvasId: z.string().nullable().optional(),
});

export async function createInspiration(raw: unknown) {
  const data = createInput.parse(raw);

  const row = db
    .insert(inspiration)
    .values({
      title: data.title,
      content: data.content,
      type: data.type,
      status: data.status,
      progress: data.progress,
      tags: data.tags,
      source: data.source ?? null,
    })
    .returning()
    .get();

  revalidatePath('/inspiration');
  revalidatePath('/');
  return row;
}

export async function updateInspiration(id: string, raw: unknown) {
  const data = updateInput.parse(raw);

  const patch: Partial<typeof inspiration.$inferInsert> = { updatedAt: new Date() };
  if (data.title !== undefined) patch.title = data.title;
  if (data.content !== undefined) patch.content = data.content;
  if (data.type !== undefined) patch.type = data.type;
  if (data.status !== undefined) patch.status = data.status;
  if (data.progress !== undefined) patch.progress = data.progress;
  if (data.tags !== undefined) patch.tags = data.tags;
  if (data.source !== undefined) patch.source = data.source;
  if (data.pinned !== undefined) patch.pinned = data.pinned;
  if (data.canvasId !== undefined) patch.canvasId = data.canvasId;

  const row = db
    .update(inspiration)
    .set(patch)
    .where(eq(inspiration.id, id))
    .returning()
    .get();

  revalidatePath('/inspiration');
  revalidatePath('/');
  return row;
}

/** 快速改状态（列表内下拉用） */
export async function setInspirationStatus(
  id: string,
  status: 'ongoing' | 'paused' | 'finished' | 'abandoned',
) {
  const row = db
    .update(inspiration)
    .set({ status, updatedAt: new Date() })
    .where(eq(inspiration.id, id))
    .returning()
    .get();
  revalidatePath('/inspiration');
  revalidatePath('/');
  return row;
}

export async function deleteInspiration(id: string) {
  db.delete(inspiration).where(eq(inspiration.id, id)).run();
  revalidatePath('/inspiration');
  revalidatePath('/');
  return { ok: true };
}

export async function listInspiration(limit = 500) {
  return db
    .select()
    .from(inspiration)
    .orderBy(desc(inspiration.pinned), desc(inspiration.updatedAt))
    .limit(limit)
    .all();
}
