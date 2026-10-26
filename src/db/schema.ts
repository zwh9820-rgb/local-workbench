/**
 * ============================================================================
 *  AI 内容生产工作台 —— 数据库 Schema
 *  驱动：better-sqlite3 ｜ ORM：drizzle-orm（sqlite-core）
 * ----------------------------------------------------------------------------
 *  共 8 张表：
 *   1. todo_items      待办任务
 *   2. events          日历日程（第一版仅总览简易展示，保留完整 schema）
 *   3. daily_review    每日复盘（Markdown）
 *   4. inspiration     灵感素材库
 *   5. agent_session   Agent 会话（含消息流 JSON）
 *   6. agent_tool_log  Agent 工具调用审计日志
 *   7. canvas          画布（= 项目，一项目一画布）
 *   8. canvas_node     画布节点
 * ----------------------------------------------------------------------------
 *  设计约定：
 *   - 主键统一 text(uuid v4)，由应用层 `crypto.randomUUID()` 生成，
 *     便于后续 Tauri 离线环境、跨设备导入导出时合并数据不冲突。
 *   - 时间统一 integer(timestamp_ms)，避免 SQLite 字符串时区问题。
 *   - 结构化数据统一走 JSON 列（drizzle 的 { mode: 'json' } 会自动序列化）。
 *   - 状态类字段用 text + enum 约束（SQLite 无原生 enum，靠 TS 层收敛）。
 *   - 不写任何浏览器强依赖代码：本文件在 Node（Next Server / Tauri sidecar）
 *     与 drizzle-kit 中均可直接 import。
 * ============================================================================
 */
import { relations, sql } from 'drizzle-orm';
import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

/* ==========================================================================
 * 0. 通用工具与共享类型
 * ========================================================================== */

const newId = (): string => crypto.randomUUID();

/** 创建时间（默认 now） */
const createdAt = () =>
  integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date());

/** 更新时间（默认 now；由仓储层在 update 时显式刷新，保证 SQLite 行为可预期） */
const updatedAt = () =>
  integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date());

/* ---------------------------- 画布相关共享类型 ---------------------------- */

/** 节点类型 */
export type NodeType =
  | 'image' // ComfyUI 生成图（含 PNG 内嵌 workflow 元数据）
  | 'prompt' // Markdown 提示词 / 文本
  | 'comfy_run' // ComfyUI 运行节点（承载 workflow json）
  | 'file' // 本地素材路径记录（第一版不打开文件）
  | 'group' // 分组框
  | 'note' // 纯文本便签
  | 'template'; // 模板节点（{{变量}} 占位）

/** ComfyUI 任务状态 */
export type ComfyTaskStatus = 'idle' | 'queued' | 'running' | 'done' | 'error';

/** 画布视口（记住上次位置与缩放） */
export interface CanvasViewState {
  x: number;
  y: number;
  zoom: number;
}

/** 画布连线（存于 canvas.edges，渲染时直接喂给 React Flow） */
export interface CanvasEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  type?: string;
  label?: string;
  animated?: boolean;
  style?: Record<string, unknown>;
}

/** image 节点 meta：由服务端解析 PNG tEXt/iTXt 后自动回填 */
export interface ImageNodeMeta {
  /** /view 接口参数，用于重新取图 */
  filename?: string;
  subfolder?: string;
  type?: string;
  positivePrompt?: string;
  negativePrompt?: string;
  /** 完整 workflow（API 格式或 UI 格式） */
  workflow?: Record<string, unknown>;
  /** 关键生成参数 */
  params?: {
    steps?: number;
    cfg?: number;
    seed?: number;
    sampler?: string;
    scheduler?: string;
    model?: string;
    width?: number;
    height?: number;
  };
  /** 来源 comfy_run 节点 id（用于溯源 / 重跑） */
  sourceNodeId?: string;
  sourceHistoryId?: string;
}

/** comfy_run 节点 meta：任务状态机全部落在这里，节点内展示进度 */
export interface ComfyRunNodeMeta {
  workflowJson?: Record<string, unknown> | null;
  /** 覆盖工作流中的正向提示词文本（支持 {{变量}}） */
  promptOverride?: string;
  negativeOverride?: string;
  /** 该节点绑定的 ComfyUI 实例地址（支持多实例） */
  comfyHost?: string;
  status?: ComfyTaskStatus;
  /** 0 - 100 */
  progress?: number;
  historyId?: string;
  lastResultImageId?: string;
  error?: string;
  submittedAt?: number;
  finishedAt?: number;
}

/** template 节点 meta */
export interface TemplateNodeMeta {
  /** 从 content 中抽取出的变量名列表 */
  variables?: string[];
  /** 目标节点类型：模板被实例化后生成的节点类型 */
  targetNodeType?: NodeType;
  /** 变量填充值 */
  values?: Record<string, string>;
}

/** group 分组框 meta */
export interface GroupNodeMeta {
  label?: string;
  collapsed?: boolean;
  /** 灰度深浅，0-3 档，禁止彩色 */
  tone?: 0 | 1 | 2 | 3;
}

/** file 节点 meta（只记录路径，不做文件 IO） */
export interface FileNodeMeta {
  ext?: string;
  size?: number;
  exists?: boolean;
  kind?: 'image' | 'video' | 'audio' | 'doc' | 'other';
}

/** prompt 节点 meta */
export interface PromptNodeMeta {
  tags?: string[];
  /** 最近一次复制时间戳，用于 UI 提示 */
  copiedAt?: number;
}

/** 节点 meta 联合体（宽松索引，方便各节点类型各取所需） */
export type CanvasNodeMeta = Partial<
  ImageNodeMeta &
    ComfyRunNodeMeta &
    TemplateNodeMeta &
    GroupNodeMeta &
    FileNodeMeta &
    PromptNodeMeta
> & { [key: string]: unknown };

/* ---------------------------- Agent 相关共享类型 --------------------------- */

export type AgentRole = 'system' | 'user' | 'assistant' | 'tool';

export interface AgentToolCall {
  id: string;
  name: string;
  /** 原始 JSON 字符串（OpenAI 协议原样保存，便于回放） */
  arguments: string;
}

/** 单条消息（存于 agent_session.messages JSON 数组） */
export interface AgentMessage {
  id: string;
  role: AgentRole;
  content: string;
  /** assistant 发起的工具调用 */
  toolCalls?: AgentToolCall[];
  /** role = tool 时对应的调用 id */
  toolCallId?: string;
  toolName?: string;
  createdAt: number;
}

/* ==========================================================================
 * 1. todo_items —— 待办任务
 * ========================================================================== */
export const todoItems = sqliteTable(
  'todo_items',
  {
    id: text('id').primaryKey().$defaultFn(newId),
    title: text('title').notNull(),
    description: text('description'),
    /** pending 未完成 / done 已完成 */
    status: text('status', { enum: ['pending', 'done'] })
      .notNull()
      .default('pending'),
    priority: text('priority', { enum: ['low', 'medium', 'high'] })
      .notNull()
      .default('medium'),
    /** 截止时间（用于「今日 / 本周」视图筛选） */
    dueDate: integer('due_date', { mode: 'timestamp_ms' }),
    completedAt: integer('completed_at', { mode: 'timestamp_ms' }),
    tags: text('tags', { mode: 'json' })
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'`),
    /** 可选：关联到某张画布（= 项目） */
    canvasId: text('canvas_id'),
    /** 手动排序权重，越小越靠前 */
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('idx_todo_status').on(t.status),
    index('idx_todo_due').on(t.dueDate),
    index('idx_todo_canvas').on(t.canvasId),
  ],
);

/* ==========================================================================
 * 2. events —— 日历日程
 *    第一版不开发完整日历页，仅在总览页做「今日日程」简易展示。
 *    schema 先完整保留，后续可平滑扩展。
 * ========================================================================== */
export const events = sqliteTable(
  'events',
  {
    id: text('id').primaryKey().$defaultFn(newId),
    title: text('title').notNull(),
    description: text('description'),
    startAt: integer('start_at', { mode: 'timestamp_ms' }).notNull(),
    endAt: integer('end_at', { mode: 'timestamp_ms' }),
    allDay: integer('all_day', { mode: 'boolean' }).notNull().default(false),
    location: text('location'),
    /** 事件来源分类：手工创建 / 由待办生成 / 由画布任务生成 */
    kind: text('kind', { enum: ['event', 'reminder', 'task'] })
      .notNull()
      .default('event'),
    /** 弱关联：例如 { type: 'todo', id: 'xxx' } */
    relatedType: text('related_type'),
    relatedId: text('related_id'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('idx_event_start').on(t.startAt)],
);

/* ==========================================================================
 * 3. daily_review —— 每日复盘（Markdown 模板形式）
 *    一天一条，reviewDate 唯一（YYYY-MM-DD）
 * ========================================================================== */
export const dailyReview = sqliteTable(
  'daily_review',
  {
    id: text('id').primaryKey().$defaultFn(newId),
    /** YYYY-MM-DD（本地日期，不使用 UTC，避免跨时区错位） */
    reviewDate: text('review_date').notNull(),
    /** Markdown 正文 */
    content: text('content').notNull().default(''),
    /** 一句话总结 */
    summary: text('summary'),
    /** 状态标记，灰度语义：great / ok / bad */
    mood: text('mood', { enum: ['great', 'ok', 'bad'] }),
    /** 完成度自评 0-10 */
    score: integer('score'),
    /** 是否由 Agent 生成的草稿（用户二次编辑后仍保留标记） */
    aiGenerated: integer('ai_generated', { mode: 'boolean' })
      .notNull()
      .default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('uniq_review_date').on(t.reviewDate)],
);

/* ==========================================================================
 * 4. inspiration —— 灵感素材库
 *    记录碎片化项目、半成品、提示词、脚本
 * ========================================================================== */
export const inspiration = sqliteTable(
  'inspiration',
  {
    id: text('id').primaryKey().$defaultFn(newId),
    title: text('title').notNull(),
    /** Markdown 正文（支持 json/bash 代码块高亮） */
    content: text('content').notNull().default(''),
    /** 素材形态 */
    type: text('type', {
      enum: ['idea', 'prompt', 'script', 'fragment', 'project', 'note'],
    })
      .notNull()
      .default('idea'),
    /** 生命周期状态 */
    status: text('status', {
      enum: ['ongoing', 'paused', 'finished', 'abandoned'],
    })
      .notNull()
      .default('ongoing'),
    /** 进度 0-100 */
    progress: integer('progress').notNull().default(0),
    tags: text('tags', { mode: 'json' })
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'`),
    /** 来源说明：网址 / 书籍 / 对话 / 自研 等 */
    source: text('source'),
    /** 已孵化成画布时记录 canvas.id */
    canvasId: text('canvas_id'),
    pinned: integer('pinned', { mode: 'boolean' }).notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('idx_insp_status').on(t.status),
    index('idx_insp_type').on(t.type),
    index('idx_insp_updated').on(t.updatedAt),
  ],
);

/* ==========================================================================
 * 5. agent_session —— Agent 会话
 *    消息流以 JSON 数组整体存放（单会话量级可控，读写简单、回放方便）
 * ========================================================================== */
export const agentSession = sqliteTable(
  'agent_session',
  {
    id: text('id').primaryKey().$defaultFn(newId),
    title: text('title').notNull().default('新会话'),
    /** 使用的模型名（来自 LM Studio /v1/models） */
    model: text('model').notNull().default('deepseek'),
    /** 会话级系统提示词（可覆盖默认） */
    systemPrompt: text('system_prompt'),
    /** AgentMessage[] */
    messages: text('messages', { mode: 'json' })
      .$type<AgentMessage[]>()
      .notNull()
      .default(sql`'[]'`),
    messageCount: integer('message_count').notNull().default(0),
    status: text('status', { enum: ['active', 'archived'] })
      .notNull()
      .default('active'),
    lastMessageAt: integer('last_message_at', { mode: 'timestamp_ms' }),
    /** 预留：token 统计、耗时、上下文摘要等 */
    meta: text('meta', { mode: 'json' })
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'`),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('idx_session_updated').on(t.updatedAt),
    index('idx_session_status').on(t.status),
  ],
);

/* ==========================================================================
 * 6. agent_tool_log —— Agent 工具调用审计日志
 *    每一次 function call 落一条，便于「查看每步 tool 调用」与排错
 * ========================================================================== */
export const agentToolLog = sqliteTable(
  'agent_tool_log',
  {
    id: text('id').primaryKey().$defaultFn(newId),
    sessionId: text('session_id')
      .notNull()
      .references(() => agentSession.id, { onDelete: 'cascade' }),
    /** 同一次 assistant 回复内的调用序号，保证日志顺序可复原 */
    stepIndex: integer('step_index').notNull().default(0),
    /** 工具名，例如 listInspiration */
    toolName: text('tool_name').notNull(),
    /** 入参 JSON */
    args: text('args', { mode: 'json' })
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'`),
    /** 出参 JSON（截断后存储，避免超长） */
    result: text('result', { mode: 'json' })
      .$type<unknown>()
      .default(sql`'null'`),
    status: text('status', { enum: ['success', 'error'] })
      .notNull()
      .default('success'),
    error: text('error'),
    durationMs: integer('duration_ms').notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    index('idx_toollog_session').on(t.sessionId),
    index('idx_toollog_created').on(t.createdAt),
  ],
);

/* ==========================================================================
 * 7. canvas —— 画布（= 项目）
 *    一个项目一张画布；整张画布可标记为模板，模板可复制出新画布
 * ========================================================================== */
export const canvas = sqliteTable(
  'canvas',
  {
    id: text('id').primaryKey().$defaultFn(newId),
    name: text('name').notNull(),
    description: text('description'),
    /** 封面图：/api/files/... 或 /view?filename=... 形式的本地引用 */
    coverImage: text('cover_image'),
    /** 是否为模板画布 */
    isTemplate: integer('is_template', { mode: 'boolean' })
      .notNull()
      .default(false),
    /** 由哪个模板/画布复制而来（溯源用） */
    sourceCanvasId: text('source_canvas_id'),
    /** 视口位置与缩放：{ x, y, zoom } */
    viewState: text('view_state', { mode: 'json' })
      .$type<CanvasViewState>()
      .notNull()
      .default(sql`'{"x":0,"y":0,"zoom":1}'`),
    /** 节点连线：CanvasEdge[] */
    edges: text('edges', { mode: 'json' })
      .$type<CanvasEdge[]>()
      .notNull()
      .default(sql`'[]'`),
    /** 预留：画布级配置（背景网格、默认 ComfyUI 实例等） */
    meta: text('meta', { mode: 'json' })
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'`),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('idx_canvas_updated').on(t.updatedAt),
    index('idx_canvas_template').on(t.isTemplate),
  ],
);

/* ==========================================================================
 * 8. canvas_node —— 画布节点
 * ========================================================================== */
export const canvasNode = sqliteTable(
  'canvas_node',
  {
    id: text('id').primaryKey().$defaultFn(newId),
    canvasId: text('canvas_id')
      .notNull()
      .references(() => canvas.id, { onDelete: 'cascade' }),
    nodeType: text('node_type', {
      enum: ['image', 'prompt', 'comfy_run', 'file', 'group', 'note', 'template'],
    }).notNull(),
    title: text('title').notNull().default(''),
    /** Markdown（prompt/note/template）或 workflow JSON 字符串（comfy_run） */
    content: text('content').notNull().default(''),
    /** file 节点：本地素材路径（仅记录，不做 IO） */
    filePath: text('file_path'),
    /** image 节点：图片访问路径（/api/comfy/view?filename=...&subfolder=...） */
    imagePath: text('image_path'),
    positionX: real('position_x').notNull().default(0),
    positionY: real('position_y').notNull().default(0),
    width: real('width').notNull().default(320),
    height: real('height').notNull().default(200),
    zIndex: integer('z_index').notNull().default(0),
    /** 节点类型专属元数据，见 CanvasNodeMeta */
    meta: text('meta', { mode: 'json' })
      .$type<CanvasNodeMeta>()
      .notNull()
      .default(sql`'{}'`),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('idx_node_canvas').on(t.canvasId),
    index('idx_node_type').on(t.nodeType),
    index('idx_node_canvas_z').on(t.canvasId, t.zIndex),
  ],
);

/* ==========================================================================
 * 9. Relations（仅用于 drizzle query API 的联表书写，不额外建表）
 * ========================================================================== */

export const canvasRelations = relations(canvas, ({ many, one }) => ({
  nodes: many(canvasNode),
  /** 来源模板画布（自关联） */
  sourceCanvas: one(canvas, {
    fields: [canvas.sourceCanvasId],
    references: [canvas.id],
    relationName: 'canvas_source',
  }),
}));

export const canvasNodeRelations = relations(canvasNode, ({ one }) => ({
  canvas: one(canvas, {
    fields: [canvasNode.canvasId],
    references: [canvas.id],
  }),
}));

export const agentSessionRelations = relations(agentSession, ({ many }) => ({
  toolLogs: many(agentToolLog),
}));

export const agentToolLogRelations = relations(agentToolLog, ({ one }) => ({
  session: one(agentSession, {
    fields: [agentToolLog.sessionId],
    references: [agentSession.id],
  }),
}));

/* ==========================================================================
 * 10. 推导类型导出（供服务层 / 组件复用）
 * ========================================================================== */

export type TodoItem = typeof todoItems.$inferSelect;
export type NewTodoItem = typeof todoItems.$inferInsert;

export type CalendarEvent = typeof events.$inferSelect;
export type NewCalendarEvent = typeof events.$inferInsert;

export type DailyReview = typeof dailyReview.$inferSelect;
export type NewDailyReview = typeof dailyReview.$inferInsert;

export type Inspiration = typeof inspiration.$inferSelect;
export type NewInspiration = typeof inspiration.$inferInsert;

export type AgentSession = typeof agentSession.$inferSelect;
export type NewAgentSession = typeof agentSession.$inferInsert;

export type AgentToolLog = typeof agentToolLog.$inferSelect;
export type NewAgentToolLog = typeof agentToolLog.$inferInsert;

export type Canvas = typeof canvas.$inferSelect;
export type NewCanvas = typeof canvas.$inferInsert;

export type CanvasNode = typeof canvasNode.$inferSelect;
export type NewCanvasNode = typeof canvasNode.$inferInsert;

/** 画布列表卡片用的聚合类型（节点数由子查询统计） */
export type CanvasListItem = Canvas & { nodeCount: number };
