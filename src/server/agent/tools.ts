/**
 * Agent 工具集（11 个）
 * ----------------------------------------------------------------------------
 * 设计约束（来自需求，不可放宽）：
 *   1. 只能操作本系统数据库内的数据
 *   2. 禁止 shell 执行、禁止任意路径文件读写
 *   3. **禁止自动提交 ComfyUI 生成任务** —— 出图必须人工点运行
 *
 * 实现方式：每个工具 = OpenAI function 定义 + zod 校验后的执行函数。
 * 参数 JSON Schema 手写（避免再引 zod-to-json-schema 依赖）。
 */
import { and, desc, eq, gte, inArray, like, lte, or, sql } from 'drizzle-orm';
import type OpenAI from 'openai';
import { z } from 'zod';
import { db } from '@/db';
import {
  canvas,
  canvasNode,
  dailyReview,
  inspiration,
  todoItems,
  type CanvasNodeMeta,
  type NodeType,
} from '@/db/schema';
import { dayRange, todayKey, weekRange } from '@/lib/utils';

type ToolDef = OpenAI.Chat.Completions.ChatCompletionTool;

export interface AgentTool {
  definition: ToolDef;
  execute: (rawArgs: unknown) => Promise<unknown>;
}

/* ------------------------------ 公共小工具 ------------------------------ */

const statusEnum = z.enum(['ongoing', 'paused', 'finished', 'abandoned']);
const inspTypeEnum = z.enum(['idea', 'prompt', 'script', 'fragment', 'project', 'note']);
const nodeTypeEnum = z.enum([
  'image',
  'prompt',
  'comfy_run',
  'file',
  'group',
  'note',
  'template',
]);

/** 工具返回给模型的文本，统一截断，避免撑爆上下文 */
function clip(value: unknown, max = 4000): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  return text.length > max ? `${text.slice(0, max)}\n…（已截断）` : text;
}

/* ------------------------------ 1. 检索灵感 ----------------------------- */

const listInspiration: AgentTool = {
  definition: {
    type: 'function',
    function: {
      name: 'listInspiration',
      description: '检索灵感素材库，支持按关键词、标签、状态筛选。用于了解用户手头有哪些半成品/点子/提示词。',
      parameters: {
        type: 'object',
        properties: {
          keyword: { type: 'string', description: '标题或内容关键词' },
          status: {
            type: 'string',
            enum: ['ongoing', 'paused', 'finished', 'abandoned'],
            description: '状态筛选',
          },
          tag: { type: 'string', description: '标签筛选' },
          limit: { type: 'number', description: '返回条数，默认 10，最大 30' },
        },
      },
    },
  },
  async execute(raw) {
    const a = z
      .object({
        keyword: z.string().optional(),
        status: statusEnum.optional(),
        tag: z.string().optional(),
        limit: z.number().int().min(1).max(30).default(10),
      })
      .parse(raw ?? {});

    const conds = [];
    if (a.status) conds.push(eq(inspiration.status, a.status));
    if (a.keyword) {
      conds.push(
        or(
          like(inspiration.title, `%${a.keyword}%`),
          like(inspiration.content, `%${a.keyword}%`),
        )!,
      );
    }

    let rows = db
      .select()
      .from(inspiration)
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(inspiration.updatedAt))
      .limit(a.limit)
      .all();

    if (a.tag) rows = rows.filter((r) => r.tags.includes(a.tag!));

    return clip(
      rows.map((r) => ({
        id: r.id,
        title: r.title,
        type: r.type,
        status: r.status,
        progress: r.progress,
        tags: r.tags,
        excerpt: r.content.slice(0, 160),
        updatedAt: r.updatedAt,
      })),
    );
  },
};

/* ------------------------------ 2. 新建灵感 ----------------------------- */

const createInspiration: AgentTool = {
  definition: {
    type: 'function',
    function: {
      name: 'createInspiration',
      description: '在灵感素材库新建一条记录（点子、提示词、脚本碎片等）。',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '标题，必填' },
          content: { type: 'string', description: 'Markdown 正文' },
          type: {
            type: 'string',
            enum: ['idea', 'prompt', 'script', 'fragment', 'project', 'note'],
          },
          status: {
            type: 'string',
            enum: ['ongoing', 'paused', 'finished', 'abandoned'],
          },
          progress: { type: 'number', description: '进度 0-100' },
          tags: { type: 'array', items: { type: 'string' } },
        },
        required: ['title'],
      },
    },
  },
  async execute(raw) {
    const a = z
      .object({
        title: z.string().min(1).max(200),
        content: z.string().max(100_000).default(''),
        type: inspTypeEnum.default('idea'),
        status: statusEnum.default('ongoing'),
        progress: z.number().int().min(0).max(100).default(0),
        tags: z.array(z.string()).default([]),
      })
      .parse(raw);

    const row = db.insert(inspiration).values(a).returning().get();
    return clip({ ok: true, id: row.id, title: row.title });
  },
};

/* ------------------------------ 3. 修改灵感 ----------------------------- */

const updateInspiration: AgentTool = {
  definition: {
    type: 'function',
    function: {
      name: 'updateInspiration',
      description: '修改灵感条目：改标题/正文、更新状态、调整进度、替换标签。',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: '灵感 id' },
          title: { type: 'string' },
          content: { type: 'string' },
          status: {
            type: 'string',
            enum: ['ongoing', 'paused', 'finished', 'abandoned'],
          },
          progress: { type: 'number' },
          tags: { type: 'array', items: { type: 'string' } },
        },
        required: ['id'],
      },
    },
  },
  async execute(raw) {
    const a = z
      .object({
        id: z.string(),
        title: z.string().min(1).max(200).optional(),
        content: z.string().max(100_000).optional(),
        status: statusEnum.optional(),
        progress: z.number().int().min(0).max(100).optional(),
        tags: z.array(z.string()).optional(),
      })
      .parse(raw);

    const { id, ...patch } = a;
    const exists = db.select().from(inspiration).where(eq(inspiration.id, id)).get();
    if (!exists) return clip({ ok: false, error: '灵感不存在' });

    db.update(inspiration)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(inspiration.id, id))
      .run();

    return clip({ ok: true, id });
  },
};

/* -------------------------------- 4. 查待办 ----------------------------- */

const listTodo: AgentTool = {
  definition: {
    type: 'function',
    function: {
      name: 'listTodo',
      description: '查询待办任务，scope 可选 today（今天）/ week（本周）/ all（全部）。',
      parameters: {
        type: 'object',
        properties: {
          scope: { type: 'string', enum: ['today', 'week', 'all'] },
          status: { type: 'string', enum: ['pending', 'done'] },
        },
      },
    },
  },
  async execute(raw) {
    const a = z
      .object({
        scope: z.enum(['today', 'week', 'all']).default('today'),
        status: z.enum(['pending', 'done']).optional(),
      })
      .parse(raw ?? {});

    const conds = [];
    if (a.status) conds.push(eq(todoItems.status, a.status));

    if (a.scope !== 'all') {
      const { start, end } = a.scope === 'today' ? dayRange() : weekRange();
      conds.push(
        or(
          and(gte(todoItems.dueDate, start), lte(todoItems.dueDate, end))!,
          and(
            sql`${todoItems.dueDate} is null`,
            gte(todoItems.createdAt, start),
            lte(todoItems.createdAt, end),
          )!,
        )!,
      );
    }

    const rows = db
      .select()
      .from(todoItems)
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(todoItems.createdAt))
      .limit(50)
      .all();

    return clip(
      rows.map((r) => ({
        id: r.id,
        title: r.title,
        status: r.status,
        priority: r.priority,
        dueDate: r.dueDate,
        tags: r.tags,
      })),
    );
  },
};

/* -------------------------------- 5. 建待办 ----------------------------- */

const createTodo: AgentTool = {
  definition: {
    type: 'function',
    function: {
      name: 'createTodo',
      description: '新建待办任务。dueDate 用 YYYY-MM-DD 格式，不传则无截止时间。',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
          priority: { type: 'string', enum: ['low', 'medium', 'high'] },
          dueDate: { type: 'string', description: 'YYYY-MM-DD' },
          tags: { type: 'array', items: { type: 'string' } },
        },
        required: ['title'],
      },
    },
  },
  async execute(raw) {
    const a = z
      .object({
        title: z.string().min(1).max(200),
        description: z.string().max(5000).optional(),
        priority: z.enum(['low', 'medium', 'high']).default('medium'),
        dueDate: z.string().optional(),
        tags: z.array(z.string()).default([]),
      })
      .parse(raw);

    const due = a.dueDate
      ? new Date(`${a.dueDate.length === 10 ? `${a.dueDate}T23:59:59` : a.dueDate}`)
      : null;

    const row = db
      .insert(todoItems)
      .values({
        title: a.title,
        description: a.description ?? null,
        priority: a.priority,
        dueDate: due && !Number.isNaN(due.getTime()) ? due : null,
        tags: a.tags,
      })
      .returning()
      .get();

    return clip({ ok: true, id: row.id, title: row.title });
  },
};

/* ------------------------------ 6. 勾选待办 ----------------------------- */

const toggleTodo: AgentTool = {
  definition: {
    type: 'function',
    function: {
      name: 'toggleTodo',
      description: '切换待办完成状态（未完成 ↔ 已完成）。',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string', description: '待办 id' } },
        required: ['id'],
      },
    },
  },
  async execute(raw) {
    const { id } = z.object({ id: z.string() }).parse(raw);
    const cur = db.select().from(todoItems).where(eq(todoItems.id, id)).get();
    if (!cur) return clip({ ok: false, error: '待办不存在' });

    const next = cur.status === 'done' ? 'pending' : 'done';
    db.update(todoItems)
      .set({
        status: next,
        completedAt: next === 'done' ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(todoItems.id, id))
      .run();

    return clip({ ok: true, id, status: next });
  },
};

/* -------------------------------- 7. 写复盘 ----------------------------- */

const createReview: AgentTool = {
  definition: {
    type: 'function',
    function: {
      name: 'createReview',
      description: '生成或更新某天的复盘草稿（Markdown）。同一天重复调用会覆盖内容。',
      parameters: {
        type: 'object',
        properties: {
          date: { type: 'string', description: 'YYYY-MM-DD，默认今天' },
          content: { type: 'string', description: 'Markdown 正文' },
          summary: { type: 'string', description: '一句话总结' },
          mood: { type: 'string', enum: ['great', 'ok', 'bad'] },
          score: { type: 'number', description: '完成度 0-10' },
        },
        required: ['content'],
      },
    },
  },
  async execute(raw) {
    const a = z
      .object({
        date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
        content: z.string().max(200_000),
        summary: z.string().max(500).optional(),
        mood: z.enum(['great', 'ok', 'bad']).optional(),
        score: z.number().int().min(0).max(10).optional(),
      })
      .parse(raw);

    const date = a.date ?? todayKey();
    const exists = db
      .select()
      .from(dailyReview)
      .where(eq(dailyReview.reviewDate, date))
      .get();

    if (exists) {
      db.update(dailyReview)
        .set({
          content: a.content,
          summary: a.summary ?? exists.summary,
          mood: a.mood ?? exists.mood,
          score: a.score ?? exists.score,
          updatedAt: new Date(),
        })
        .where(eq(dailyReview.id, exists.id))
        .run();
      return clip({ ok: true, id: exists.id, date, updated: true });
    }

    const row = db
      .insert(dailyReview)
      .values({
        reviewDate: date,
        content: a.content,
        summary: a.summary ?? null,
        mood: a.mood ?? null,
        score: a.score ?? null,
        aiGenerated: true,
      })
      .returning()
      .get();

    return clip({ ok: true, id: row.id, date, updated: false });
  },
};

/* ------------------------------ 8. 全局检索 ----------------------------- */

const searchAll: AgentTool = {
  definition: {
    type: 'function',
    function: {
      name: 'searchAll',
      description: '跨表全局检索（待办/灵感/画布/画布节点/复盘），返回最相关的若干条。',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '检索词' },
          limit: { type: 'number', description: '每类条数，默认 5' },
        },
        required: ['query'],
      },
    },
  },
  async execute(raw) {
    const a = z
      .object({ query: z.string().min(1), limit: z.number().int().min(1).max(10).default(5) })
      .parse(raw);

    const p = `%${a.query}%`;
    const todos = db
      .select({ id: todoItems.id, title: todoItems.title, status: todoItems.status })
      .from(todoItems)
      .where(like(todoItems.title, p))
      .limit(a.limit)
      .all();

    const insp = db
      .select({ id: inspiration.id, title: inspiration.title, status: inspiration.status })
      .from(inspiration)
      .where(or(like(inspiration.title, p), like(inspiration.content, p)))
      .limit(a.limit)
      .all();

    const canvases = db
      .select({ id: canvas.id, name: canvas.name })
      .from(canvas)
      .where(or(like(canvas.name, p), like(canvas.description, p)))
      .limit(a.limit)
      .all();

    const nodes = db
      .select({
        id: canvasNode.id,
        canvasId: canvasNode.canvasId,
        title: canvasNode.title,
        content: canvasNode.content,
      })
      .from(canvasNode)
      .where(or(like(canvasNode.title, p), like(canvasNode.content, p)))
      .limit(a.limit)
      .all();

    return clip({
      todo: todos,
      inspiration: insp,
      canvas: canvases,
      node: nodes.map((n) => ({ ...n, content: n.content.slice(0, 120) })),
    });
  },
};

/* -------------------------------- 9. 列画布 ----------------------------- */

const listCanvas: AgentTool = {
  definition: {
    type: 'function',
    function: {
      name: 'listCanvas',
      description: '列出所有项目画布（含节点数、是否模板），用于定位用户在做哪个项目。',
      parameters: { type: 'object', properties: {} },
    },
  },
  async execute() {
    const rows = db
      .select({
        id: canvas.id,
        name: canvas.name,
        description: canvas.description,
        isTemplate: canvas.isTemplate,
        updatedAt: canvas.updatedAt,
        nodeCount: sql<number>`(select count(*) from canvas_node where canvas_node.canvas_id = canvas.id)`,
      })
      .from(canvas)
      .orderBy(desc(canvas.updatedAt))
      .limit(30)
      .all();

    return clip(rows);
  },
};

/* -------------------------------- 10. 读画布 ---------------------------- */

const getCanvas: AgentTool = {
  definition: {
    type: 'function',
    function: {
      name: 'getCanvas',
      description: '读取某张画布的所有节点内容（提示词、便签、ComfyUI 工作流概要）。',
      parameters: {
        type: 'object',
        properties: { canvasId: { type: 'string' } },
        required: ['canvasId'],
      },
    },
  },
  async execute(raw) {
    const { canvasId } = z.object({ canvasId: z.string() }).parse(raw);

    const c = db.select().from(canvas).where(eq(canvas.id, canvasId)).get();
    if (!c) return clip({ ok: false, error: '画布不存在' });

    const nodes = db
      .select()
      .from(canvasNode)
      .where(eq(canvasNode.canvasId, canvasId))
      .orderBy(canvasNode.zIndex)
      .all();

    return clip({
      canvas: { id: c.id, name: c.name, description: c.description },
      nodes: nodes.map((n) => ({
        id: n.id,
        type: n.nodeType,
        title: n.title,
        content: n.content.slice(0, 500),
        status: (n.meta as CanvasNodeMeta)?.status,
        imagePath: n.imagePath,
      })),
    });
  },
};

/* ---------------------------- 11. 画布建节点 ---------------------------- */

const createCanvasNode: AgentTool = {
  definition: {
    type: 'function',
    function: {
      name: 'createCanvasNode',
      description:
        '在指定画布新建节点。只建议创建 prompt / note / template / file 类型；' +
        '不要创建 comfy_run 并试图运行（生成任务必须由用户手动触发）。',
      parameters: {
        type: 'object',
        properties: {
          canvasId: { type: 'string' },
          nodeType: {
            type: 'string',
            enum: ['prompt', 'note', 'template', 'file', 'group'],
          },
          title: { type: 'string' },
          content: { type: 'string', description: 'Markdown 内容' },
          positionX: { type: 'number' },
          positionY: { type: 'number' },
        },
        required: ['canvasId', 'nodeType'],
      },
    },
  },
  async execute(raw) {
    const a = z
      .object({
        canvasId: z.string(),
        nodeType: nodeTypeEnum,
        title: z.string().max(200).default(''),
        content: z.string().max(100_000).default(''),
        positionX: z.number().default(0),
        positionY: z.number().default(0),
      })
      .parse(raw);

    // 明确拒绝 ComfyUI 运行节点：出图必须人工点运行
    if (a.nodeType === 'comfy_run' || a.nodeType === 'image') {
      return clip({
        ok: false,
        error: '出于安全约束，Agent 不能创建 ComfyUI 运行节点或图片节点，请让用户手动操作',
      });
    }

    const c = db.select().from(canvas).where(eq(canvas.id, a.canvasId)).get();
    if (!c) return clip({ ok: false, error: '画布不存在' });

    // 默认放在画布左上角往右下排，避免叠在一起
    const count =
      db
        .select({ c: sql<number>`count(*)` })
        .from(canvasNode)
        .where(eq(canvasNode.canvasId, a.canvasId))
        .get()?.c ?? 0;

    const row = db
      .insert(canvasNode)
      .values({
        canvasId: a.canvasId,
        nodeType: a.nodeType as NodeType,
        title: a.title || a.nodeType,
        content: a.content,
        positionX: a.positionX || 80 + (count % 4) * 380,
        positionY: a.positionY || 80 + Math.floor(count / 4) * 320,
        width: 320,
        height: 240,
        zIndex: count,
        meta: {},
      })
      .returning()
      .get();

    db.update(canvas).set({ updatedAt: new Date() }).where(eq(canvas.id, a.canvasId)).run();

    return clip({ ok: true, id: row.id, title: row.title, canvasId: a.canvasId });
  },
};

/* -------------------------------- 注册表 -------------------------------- */

export const TOOLS: Record<string, AgentTool> = {
  listInspiration,
  createInspiration,
  updateInspiration,
  listTodo,
  createTodo,
  toggleTodo,
  createReview,
  searchAll,
  listCanvas,
  getCanvas,
  createCanvasNode,
};

export const TOOL_DEFINITIONS: ToolDef[] = Object.values(TOOLS).map((t) => t.definition);
