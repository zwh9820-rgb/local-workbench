/**
 * 总览页聚合查询
 * ----------------------------------------------------------------------------
 * 一次把首页需要的所有数据取齐，避免多个卡片各自查库。
 * 全部为同步查询（better-sqlite3），在 Server Component 中直接调用。
 */
import { and, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { db } from '@/db';
import {
  canvas,
  canvasNode,
  dailyReview,
  events,
  inspiration,
  todoItems,
  type Canvas,
} from '@/db/schema';
import { dayRange, todayKey } from '@/lib/utils';

export interface OverviewCanvas extends Canvas {
  nodeCount: number;
}

export interface ComfyTaskRow {
  nodeId: string;
  canvasId: string;
  canvasName: string;
  title: string;
  status: string;
  progress: number;
  updatedAt: Date;
}

export interface OverviewData {
  stats: {
    todoTotal: number;
    todoDone: number;
    inspirationOngoing: number;
    canvasCount: number;
    comfyActive: number;
    reviewDone: boolean;
  };
  canvases: OverviewCanvas[];
  comfyTasks: ComfyTaskRow[];
  inspirations: Array<{
    id: string;
    title: string;
    status: string;
    progress: number;
    updatedAt: Date;
  }>;
  todayEvents: Array<{ id: string; title: string; startAt: Date; allDay: boolean }>;
  todayReview: { id: string; reviewDate: string; summary: string | null } | null;
}

export function getOverview(): OverviewData {
  const { start, end } = dayRange();
  const today = todayKey();

  /* ------------------------------ 待办统计 ------------------------------ */
  // 「今日」= 截止时间落在今天，或今天创建且未完成
  const todayTodos = db
    .select({ id: todoItems.id, status: todoItems.status })
    .from(todoItems)
    .where(
      and(
        sql`(${todoItems.dueDate} between ${start.getTime()} and ${end.getTime()} or (${todoItems.dueDate} is null and ${todoItems.createdAt} between ${start.getTime()} and ${end.getTime()}))`,
      ),
    )
    .all();

  const todoTotal = todayTodos.length;
  const todoDone = todayTodos.filter((t) => t.status === 'done').length;

  /* ------------------------------ 灵感统计 ------------------------------ */
  const inspRow = db
    .select({ c: sql<number>`count(*)` })
    .from(inspiration)
    .where(eq(inspiration.status, 'ongoing'))
    .get();

  /* ------------------------------ 画布列表 ------------------------------ */
  const canvases = db
    .select({
      id: canvas.id,
      name: canvas.name,
      description: canvas.description,
      coverImage: canvas.coverImage,
      isTemplate: canvas.isTemplate,
      sourceCanvasId: canvas.sourceCanvasId,
      viewState: canvas.viewState,
      edges: canvas.edges,
      meta: canvas.meta,
      createdAt: canvas.createdAt,
      updatedAt: canvas.updatedAt,
      // 注意：select 列表里的原生 SQL 片段必须手写完整表名。
      // drizzle 会把 ${canvas.id} 简写成不带表名的 "id"，子查询里会撞上 canvas_node.id。
      nodeCount: sql<number>`(select count(*) from canvas_node where canvas_node.canvas_id = canvas.id)`,
    })
    .from(canvas)
    .orderBy(desc(canvas.updatedAt))
    .limit(8)
    .all() as OverviewCanvas[];

  const canvasCount =
    db.select({ c: sql<number>`count(*)` }).from(canvas).get()?.c ?? 0;

  /* ---------------------------- ComfyUI 任务 ---------------------------- */
  const comfyTasks = db
    .select({
      nodeId: canvasNode.id,
      canvasId: canvasNode.canvasId,
      canvasName: canvas.name,
      title: canvasNode.title,
      status: sql<string>`coalesce(json_extract(canvas_node.meta, '$.status'), 'idle')`,
      progress: sql<number>`coalesce(json_extract(canvas_node.meta, '$.progress'), 0)`,
      updatedAt: canvasNode.updatedAt,
    })
    .from(canvasNode)
    .leftJoin(canvas, sql`${canvas.id} = ${canvasNode.canvasId}`)
    .where(
      and(
        eq(canvasNode.nodeType, 'comfy_run'),
        inArray(
          sql`coalesce(json_extract(canvas_node.meta, '$.status'), 'idle')`,
          ['queued', 'running', 'error', 'done'],
        ),
      ),
    )
    .orderBy(desc(canvasNode.updatedAt))
    .limit(6)
    .all() as ComfyTaskRow[];

  const comfyActive = comfyTasks.filter(
    (t) => t.status === 'running' || t.status === 'queued',
  ).length;

  /* ------------------------------ 灵感动态 ------------------------------ */
  const inspirations = db
    .select({
      id: inspiration.id,
      title: inspiration.title,
      status: inspiration.status,
      progress: inspiration.progress,
      updatedAt: inspiration.updatedAt,
    })
    .from(inspiration)
    .where(inArray(inspiration.status, ['ongoing', 'paused']))
    .orderBy(desc(inspiration.updatedAt))
    .limit(5)
    .all();

  /* ------------------------------ 今日日程 ------------------------------ */
  const todayEvents = db
    .select({
      id: events.id,
      title: events.title,
      startAt: events.startAt,
      allDay: events.allDay,
    })
    .from(events)
    .where(and(gte(events.startAt, start), lte(events.startAt, end)))
    .orderBy(events.startAt)
    .limit(6)
    .all();

  /* ------------------------------ 今日复盘 ------------------------------ */
  const review = db
    .select({
      id: dailyReview.id,
      reviewDate: dailyReview.reviewDate,
      summary: dailyReview.summary,
    })
    .from(dailyReview)
    .where(eq(dailyReview.reviewDate, today))
    .get();

  return {
    stats: {
      todoTotal,
      todoDone,
      inspirationOngoing: inspRow?.c ?? 0,
      canvasCount,
      comfyActive,
      reviewDone: Boolean(review),
    },
    canvases,
    comfyTasks,
    inspirations,
    todayEvents,
    todayReview: review ?? null,
  };
}
