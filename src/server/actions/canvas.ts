'use server';

/**
 * 画布（= 项目）—— 服务端操作
 * ----------------------------------------------------------------------------
 * 画布编辑器的所有写操作都走这里：
 *   - 画布 CRUD、模板复制
 *   - 节点 CRUD、批量位置保存
 *   - 连线（edges）与视口（viewState）保存
 * 说明：位置/连线属于高频写入，编辑器端做节流后再调用，避免每次拖拽都打库。
 */
import { revalidatePath } from 'next/cache';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import {
  canvas,
  canvasNode,
  type Canvas,
  type CanvasEdge,
  type CanvasNode,
  type CanvasNodeMeta,
  type CanvasViewState,
} from '@/db/schema';
import { NODE_DEFAULT_SIZE } from '@/lib/constants';
import { uuid } from '@/lib/utils';

/* ------------------------------- 查询 ---------------------------------- */

export interface CanvasWithNodes {
  canvas: Canvas;
  nodes: CanvasNode[];
}

export async function listCanvases(limit = 200) {
  return db
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
      // select 列表内的原生 SQL 必须写完整表名（drizzle 会把列简写成 "id"）
      nodeCount: sql<number>`(select count(*) from canvas_node where canvas_node.canvas_id = canvas.id)`,
    })
    .from(canvas)
    .orderBy(desc(canvas.updatedAt))
    .limit(limit)
    .all();
}

export async function getCanvasWithNodes(id: string): Promise<CanvasWithNodes | null> {
  const c = db.select().from(canvas).where(eq(canvas.id, id)).get();
  if (!c) return null;

  const nodes = db
    .select()
    .from(canvasNode)
    .where(eq(canvasNode.canvasId, id))
    .orderBy(canvasNode.zIndex)
    .all();

  return { canvas: c, nodes };
}

/* ------------------------------- 画布 CRUD ------------------------------ */

const createCanvasInput = z.object({
  name: z.string().trim().min(1, '画布名称不能为空').max(120),
  description: z.string().max(2000).optional().nullable(),
  isTemplate: z.boolean().default(false),
  /** 从某张画布（通常是模板）复制 */
  fromCanvasId: z.string().optional().nullable(),
});

export async function createCanvas(raw: unknown) {
  const data = createCanvasInput.parse(raw);

  const row = db
    .insert(canvas)
    .values({
      name: data.name,
      description: data.description ?? null,
      isTemplate: data.isTemplate,
      sourceCanvasId: data.fromCanvasId ?? null,
    })
    .returning()
    .get();

  // 从模板复制节点与连线
  if (data.fromCanvasId) {
    const source = await getCanvasWithNodes(data.fromCanvasId);
    if (source && source.nodes.length > 0) {
      db.insert(canvasNode)
        .values(
          source.nodes.map((n) => ({
            canvasId: row.id,
            nodeType: n.nodeType,
            title: n.title,
            content: n.content,
            filePath: n.filePath,
            imagePath: n.imagePath,
            positionX: n.positionX,
            positionY: n.positionY,
            width: n.width,
            height: n.height,
            zIndex: n.zIndex,
            meta: n.meta,
          })),
        )
        .run();

      // 连线需要重映射 id：这里保持原样（模板连线按位置无关，仅复制结构）
      db.update(canvas)
        .set({ edges: source.canvas.edges })
        .where(eq(canvas.id, row.id))
        .run();
    }
  }

  revalidatePath('/canvas');
  revalidatePath('/');
  return row;
}

export async function updateCanvas(
  id: string,
  patch: { name?: string; description?: string | null; coverImage?: string | null },
) {
  const row = db
    .update(canvas)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(canvas.id, id))
    .returning()
    .get();

  revalidatePath('/canvas');
  revalidatePath(`/canvas/${id}`);
  revalidatePath('/');
  return row;
}

export async function deleteCanvas(id: string) {
  // canvas_node 由外键 ON DELETE CASCADE 自动清理
  db.delete(canvas).where(eq(canvas.id, id)).run();
  revalidatePath('/canvas');
  revalidatePath('/');
  return { ok: true };
}

/** 标记 / 取消标记为模板 */
export async function setCanvasTemplate(id: string, isTemplate: boolean) {
  const row = db
    .update(canvas)
    .set({ isTemplate, updatedAt: new Date() })
    .where(eq(canvas.id, id))
    .returning()
    .get();
  revalidatePath('/canvas');
  revalidatePath(`/canvas/${id}`);
  return row;
}

/* ------------------------------- 视口 / 连线 ---------------------------- */

export async function saveViewState(id: string, viewState: CanvasViewState) {
  db.update(canvas)
    .set({ viewState, updatedAt: new Date() })
    .where(eq(canvas.id, id))
    .run();
  return { ok: true };
}

export async function saveEdges(id: string, edges: CanvasEdge[]) {
  db.update(canvas)
    .set({ edges, updatedAt: new Date() })
    .where(eq(canvas.id, id))
    .run();
  return { ok: true };
}

/* -------------------------------- 节点 CRUD ----------------------------- */

const nodeTypeEnum = z.enum([
  'image',
  'prompt',
  'comfy_run',
  'file',
  'group',
  'note',
  'template',
]);

const createNodeInput = z.object({
  canvasId: z.string(),
  nodeType: nodeTypeEnum,
  title: z.string().max(200).default(''),
  content: z.string().max(500_000).default(''),
  filePath: z.string().max(1000).optional().nullable(),
  imagePath: z.string().max(1000).optional().nullable(),
  positionX: z.number().default(0),
  positionY: z.number().default(0),
  width: z.number().optional(),
  height: z.number().optional(),
  zIndex: z.number().int().default(0),
  meta: z.record(z.unknown()).optional(),
});

export async function createCanvasNode(raw: unknown) {
  const data = createNodeInput.parse(raw);
  const size = NODE_DEFAULT_SIZE[data.nodeType];

  const row = db
    .insert(canvasNode)
    .values({
      id: uuid(),
      canvasId: data.canvasId,
      nodeType: data.nodeType,
      title: data.title,
      content: data.content,
      filePath: data.filePath ?? null,
      imagePath: data.imagePath ?? null,
      positionX: data.positionX,
      positionY: data.positionY,
      width: data.width ?? size.width,
      height: data.height ?? size.height,
      zIndex: data.zIndex,
      meta: (data.meta ?? {}) as CanvasNodeMeta,
    })
    .returning()
    .get();

  db.update(canvas)
    .set({ updatedAt: new Date() })
    .where(eq(canvas.id, data.canvasId))
    .run();

  revalidatePath(`/canvas/${data.canvasId}`);
  return row;
}

export async function updateCanvasNode(
  id: string,
  patch: {
    title?: string;
    content?: string;
    filePath?: string | null;
    imagePath?: string | null;
    width?: number;
    height?: number;
    zIndex?: number;
    meta?: CanvasNodeMeta;
  },
) {
  const row = db
    .update(canvasNode)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(canvasNode.id, id))
    .returning()
    .get();
  return row;
}

export async function deleteCanvasNode(id: string) {
  const node = db.select().from(canvasNode).where(eq(canvasNode.id, id)).get();
  if (!node) return { ok: false };

  db.delete(canvasNode).where(eq(canvasNode.id, id)).run();

  // 同时清理悬空连线
  const c = db.select().from(canvas).where(eq(canvas.id, node.canvasId)).get();
  if (c) {
    const nextEdges = c.edges.filter((e) => e.source !== id && e.target !== id);
    db.update(canvas)
      .set({ edges: nextEdges, updatedAt: new Date() })
      .where(eq(canvas.id, node.canvasId))
      .run();
  }

  revalidatePath(`/canvas/${node.canvasId}`);
  return { ok: true };
}

/** 批量保存节点位置（拖拽结束后调用一次） */
export async function saveNodePositions(
  canvasId: string,
  positions: Array<{ id: string; x: number; y: number }>,
) {
  if (positions.length === 0) return { ok: true };

  const stmt = sql.join(
    positions.map(
      (p) =>
        sql`update canvas_node set position_x = ${p.x}, position_y = ${p.y} where id = ${p.id} and canvas_id = ${canvasId}`,
    ),
    sql`; `,
  );
  db.run(stmt);

  db.update(canvas).set({ updatedAt: new Date() }).where(eq(canvas.id, canvasId)).run();
  return { ok: true };
}

/** 批量删除（框选删除） */
export async function deleteCanvasNodes(canvasId: string, ids: string[]) {
  if (ids.length === 0) return { ok: true };

  db.delete(canvasNode)
    .where(and(eq(canvasNode.canvasId, canvasId), inArray(canvasNode.id, ids)))
    .run();

  const c = db.select().from(canvas).where(eq(canvas.id, canvasId)).get();
  if (c) {
    const nextEdges = c.edges.filter((e) => !ids.includes(e.source) && !ids.includes(e.target));
    db.update(canvas)
      .set({ edges: nextEdges, updatedAt: new Date() })
      .where(eq(canvas.id, canvasId))
      .run();
  }

  revalidatePath(`/canvas/${canvasId}`);
  return { ok: true };
}
