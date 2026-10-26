'use server';

/**
 * 待办任务 —— 服务端操作（Server Actions）
 * ----------------------------------------------------------------------------
 * 全部走服务端，前端只传表单值。这样后续 Tauri 打包时业务逻辑零改动。
 * 约定：每个 action 成功返回数据，失败抛错（由调用方 try/catch 提示）。
 */
import { revalidatePath } from 'next/cache';
import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import { todoItems } from '@/db/schema';

const priorityEnum = z.enum(['low', 'medium', 'high']);

const createInput = z.object({
  title: z.string().trim().min(1, '标题不能为空').max(200),
  description: z.string().max(5000).optional(),
  priority: priorityEnum.default('medium'),
  /** YYYY-MM-DD 或 ISO 字符串；空则无截止时间 */
  dueDate: z.string().optional().nullable(),
  tags: z.array(z.string()).default([]),
  canvasId: z.string().optional().nullable(),
});

const updateInput = createInput.partial().extend({
  status: z.enum(['pending', 'done']).optional(),
});

/** 把 YYYY-MM-DD 解析为当天 23:59:59 的本地时间 */
function parseDueDate(raw?: string | null): Date | null {
  if (!raw) return null;
  const d = new Date(raw.length === 10 ? `${raw}T23:59:59` : raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function createTodo(raw: unknown) {
  const data = createInput.parse(raw);

  const row = db
    .insert(todoItems)
    .values({
      title: data.title,
      description: data.description ?? null,
      priority: data.priority,
      dueDate: parseDueDate(data.dueDate),
      tags: data.tags,
      canvasId: data.canvasId ?? null,
    })
    .returning()
    .get();

  revalidatePath('/todo');
  revalidatePath('/');
  return row;
}

export async function updateTodo(id: string, raw: unknown) {
  const data = updateInput.parse(raw);

  const patch: Partial<typeof todoItems.$inferInsert> = { updatedAt: new Date() };
  if (data.title !== undefined) patch.title = data.title;
  if (data.description !== undefined) patch.description = data.description;
  if (data.priority !== undefined) patch.priority = data.priority;
  if (data.dueDate !== undefined) patch.dueDate = parseDueDate(data.dueDate);
  if (data.tags !== undefined) patch.tags = data.tags;
  if (data.canvasId !== undefined) patch.canvasId = data.canvasId;
  if (data.status !== undefined) {
    patch.status = data.status;
    patch.completedAt = data.status === 'done' ? new Date() : null;
  }

  const row = db.update(todoItems).set(patch).where(eq(todoItems.id, id)).returning().get();
  revalidatePath('/todo');
  revalidatePath('/');
  return row;
}

/** 勾选 / 取消勾选 */
export async function toggleTodo(id: string) {
  const current = db.select().from(todoItems).where(eq(todoItems.id, id)).get();
  if (!current) throw new Error('任务不存在');

  const nextStatus = current.status === 'done' ? 'pending' : 'done';
  const row = db
    .update(todoItems)
    .set({
      status: nextStatus,
      completedAt: nextStatus === 'done' ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(todoItems.id, id))
    .returning()
    .get();

  revalidatePath('/todo');
  revalidatePath('/');
  return row;
}

export async function deleteTodo(id: string) {
  db.delete(todoItems).where(eq(todoItems.id, id)).run();
  revalidatePath('/todo');
  revalidatePath('/');
  return { ok: true };
}

/** 服务端读取（Agent 工具也会复用同一份查询逻辑） */
export async function listTodos(limit = 500) {
  return db.select().from(todoItems).orderBy(desc(todoItems.createdAt)).limit(limit).all();
}
