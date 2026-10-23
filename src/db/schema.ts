import { relations, sql } from 'drizzle-orm';
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

/* -------------------------------------------------------------------------- */
/*  通用工具                                                                    */
/* -------------------------------------------------------------------------- */

/** 统一主键：字符串 ID（crypto.randomUUID / nanoid 均可） */
const pk = () =>
  text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

/** 创建时间（毫秒时间戳，SQLite 存 INTEGER，Drizzle 自动转 Date） */
const createdAt = () =>
  integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`);

/** 更新时间 */
const updatedAt = () =>
  integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`);

/** 字符串数组 → JSON 文本列 */
const jsonArray = <T extends string = string>(name: string) =>
  text(name, { mode: 'json' }).$type<T[]>().default(sql`'[]'`);

/* -------------------------------------------------------------------------- */
/*  枚举常量（同时供 Zod 校验复用）                                              */
/* -------------------------------------------------------------------------- */

export const TODO_STATUS = ['pending', 'doing', 'done'] as const;
export const TODO_PRIORITY = ['low', 'medium', 'high'] as const;
export const INSPIRATION_STATUS = [
  'ongoing',
  'paused',
  'finished',
  'abandoned',
] as const;
export const INSPIRATION_TYPE = [
  'prompt', // 提示词
  'comfyui', // ComfyUI 工作流
  'script', // 漫剧脚本
  'video', // 皮卡短视频素材
  'note', // 普通笔记
] as const;
export const AGENT_MODE = ['workbench', 'files'] as const;
export const AGENT_SESSION_STATUS = ['active', 'archived'] as const;
export const CLIPBOARD_TYPE = ['text', 'markdown', 'code', 'url'] as const;
export const TOOL_LOG_STATUS = ['ok', 'error'] as const;

export type TodoStatus = (typeof TODO_STATUS)[number];
export type TodoPriority = (typeof TODO_PRIORITY)[number];
export type InspirationStatus = (typeof INSPIRATION_STATUS)[number];
export type InspirationType = (typeof INSPIRATION_TYPE)[number];
export type AgentMode = (typeof AGENT_MODE)[number];
export type ClipboardType = (typeof CLIPBOARD_TYPE)[number];

/* -------------------------------------------------------------------------- */
/*  1. events 日历日程                                                          */
/* -------------------------------------------------------------------------- */

export const events = sqliteTable(
  'events',
  {
    id: pk(),
    title: text('title').notNull(),
    description: text('description'),
    /** 开始时间 */
    startAt: integer('start_at', { mode: 'timestamp_ms' }).notNull(),
    /** 结束时间（可空 = 单点日程） */
    endAt: integer('end_at', { mode: 'timestamp_ms' }),
    /** 全天日程 */
    allDay: integer('all_day', { mode: 'boolean' }).notNull().default(false),
    location: text('location'),
    /** 自定义标签，例如「创作」「会议」「发布」 */
    category: text('category'),
    tags: jsonArray('tags'),
    /** 提醒时间，桌面端后续可用于本地通知 */
    remindAt: integer('remind_at', { mode: 'timestamp_ms' }),
    /** 是否完成/已过 */
    isDone: integer('is_done', { mode: 'boolean' }).notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('events_start_at_idx').on(t.startAt)],
);

/* -------------------------------------------------------------------------- */
/*  2. todo_items 待办任务                                                      */
/* -------------------------------------------------------------------------- */

export const todoItems = sqliteTable(
  'todo_items',
  {
    id: pk(),
    title: text('title').notNull(),
    note: text('note'),
    status: text('status').$type<TodoStatus>().notNull().default('pending'),
    priority: text('priority').$type<TodoPriority>().notNull().default('medium'),
    /** 计划日期 YYYY-MM-DD（今日待办按此筛选） */
    planDate: text('plan_date').notNull(),
    /** 周标识 YYYY-Www（本周清单按此筛选） */
    weekKey: text('week_key').notNull(),
    /** 截止日期 YYYY-MM-DD */
    dueDate: text('due_date'),
    tags: jsonArray('tags'),
    /** 来源：manual / agent / clipboard / review */
    source: text('source').notNull().default('manual'),
    /** 预估番茄数或分钟数 */
    estimateMin: integer('estimate_min'),
    /** 手动排序权重，越小越靠前 */
    sortOrder: integer('sort_order').notNull().default(0),
    completedAt: integer('completed_at', { mode: 'timestamp_ms' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('todo_plan_date_idx').on(t.planDate),
    index('todo_week_key_idx').on(t.weekKey),
    index('todo_status_idx').on(t.status),
  ],
);

/* -------------------------------------------------------------------------- */
/*  3. ai_hot AI 热点记录                                                       */
/* -------------------------------------------------------------------------- */

export const aiHot = sqliteTable(
  'ai_hot',
  {
    id: pk(),
    title: text('title').notNull(),
    /** 一句话摘要 */
    summary: text('summary'),
    /** Markdown 正文 / 笔记 */
    content: text('content'),
    source: text('source'),
    sourceUrl: text('source_url'),
    category: text('category'),
    tags: jsonArray('tags'),
    /** 热度自评分 0-100 */
    heat: integer('heat').notNull().default(0),
    publishedAt: integer('published_at', { mode: 'timestamp_ms' }),
    isStarred: integer('is_starred', { mode: 'boolean' }).notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('ai_hot_created_idx').on(t.createdAt)],
);

/* -------------------------------------------------------------------------- */
/*  4. daily_review 每日复盘                                                    */
/* -------------------------------------------------------------------------- */

export const dailyReview = sqliteTable(
  'daily_review',
  {
    id: pk(),
    /** 一个日期只有一条复盘 YYYY-MM-DD */
    reviewDate: text('review_date').notNull(),
    summary: text('summary'),
    wellDone: text('well_done'),
    problems: text('problems'),
    improvements: text('improvements'),
    tomorrowPlan: text('tomorrow_plan'),
    /** 复盘正文（Markdown） */
    content: text('content'),
    /** 1-5 分 */
    moodScore: integer('mood_score'),
    energyScore: integer('energy_score'),
    tags: jsonArray('tags'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('daily_review_date_uq').on(t.reviewDate)],
);

/* -------------------------------------------------------------------------- */
/*  5. inspiration 灵感素材库（核心表）                                          */
/* -------------------------------------------------------------------------- */

export const inspiration = sqliteTable(
  'inspiration',
  {
    id: pk(),
    title: text('title').notNull(),
    /** 摘要，列表卡片展示用 */
    summary: text('summary'),
    /** Markdown 正文：提示词 / ComfyUI JSON / 脚本 / 调试日志 */
    content: text('content'),
    type: text('type').$type<InspirationType>().notNull().default('note'),
    status: text('status')
      .$type<InspirationStatus>()
      .notNull()
      .default('ongoing'),
    /** 进度 0-100 */
    progress: integer('progress').notNull().default(0),
    tags: jsonArray('tags'),
    /** 本地文件路径（例如 D:/assets/comfy/xxx.json），仅记录不自动读写 */
    localPath: text('local_path'),
    /** 封面图相对路径 */
    coverImage: text('cover_image'),
    isFavorite: integer('is_favorite', { mode: 'boolean' })
      .notNull()
      .default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('inspiration_status_idx').on(t.status),
    index('inspiration_type_idx').on(t.type),
    index('inspiration_updated_idx').on(t.updatedAt),
  ],
);

/* -------------------------------------------------------------------------- */
/*  6. prompt_templates 提示词模板                                              */
/* -------------------------------------------------------------------------- */

export const promptTemplates = sqliteTable(
  'prompt_templates',
  {
    id: pk(),
    name: text('name').notNull(),
    description: text('description'),
    /** 模板正文，支持 {{变量}} 占位符 */
    content: text('content').notNull().default(''),
    /** 从 content 解析出的变量名列表，便于检索与表单渲染 */
    variables: jsonArray('variables'),
    category: text('category'),
    tags: jsonArray('tags'),
    /** 建议模型，例如 deepseek / flux / sdxl */
    model: text('model'),
    usageCount: integer('usage_count').notNull().default(0),
    lastUsedAt: integer('last_used_at', { mode: 'timestamp_ms' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('prompt_templates_category_idx').on(t.category)],
);

/* -------------------------------------------------------------------------- */
/*  7. clipboard_snapshots 剪贴板快照                                            */
/* -------------------------------------------------------------------------- */

export const clipboardSnapshots = sqliteTable(
  'clipboard_snapshots',
  {
    id: pk(),
    content: text('content').notNull(),
    contentType: text('content_type')
      .$type<ClipboardType>()
      .notNull()
      .default('text'),
    /** 来源页面 / 应用标识 */
    sourceApp: text('source_app'),
    charCount: integer('char_count').notNull().default(0),
    isPinned: integer('is_pinned', { mode: 'boolean' }).notNull().default(false),
    /** 已转换为灵感条目时回填 ID */
    inspirationId: text('inspiration_id'),
    createdAt: createdAt(),
  },
  (t) => [index('clipboard_created_idx').on(t.createdAt)],
);

/* -------------------------------------------------------------------------- */
/*  8. agent_session Agent 会话                                                 */
/* -------------------------------------------------------------------------- */

/** 会话中单条消息的存储结构（整段 JSON 存进 messages 列） */
export type AgentToolCallRef = {
  id: string;
  name: string;
  /** 原始 JSON 字符串（OpenAI 协议要求） */
  arguments: string;
};

export type AgentMessage = {
  id: string;
  role: 'user' | 'assistant' | 'tool' | 'system';
  content: string;
  /** tool 角色时对应 tool_call_id */
  toolCallId?: string;
  toolName?: string;
  /** assistant 消息附带的工具调用请求，回放历史时重建上下文用 */
  toolCalls?: AgentToolCallRef[];
  createdAt: number;
};

export const agentSession = sqliteTable(
  'agent_session',
  {
    id: pk(),
    title: text('title').notNull().default('新会话'),
    /** workbench = 工作台助手；files = 允许读取白名单素材文件 */
    mode: text('mode').$type<AgentMode>().notNull().default('workbench'),
    model: text('model'),
    status: text('status')
      .$type<(typeof AGENT_SESSION_STATUS)[number]>()
      .notNull()
      .default('active'),
    /** 完整对话消息（JSON 数组，AgentMessage[]） */
    messages: text('messages', { mode: 'json' })
      .$type<AgentMessage[]>()
      .notNull()
      .default(sql`'[]'`),
    messageCount: integer('message_count').notNull().default(0),
    lastMessageAt: integer('last_message_at', { mode: 'timestamp_ms' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('agent_session_updated_idx').on(t.updatedAt)],
);

/* -------------------------------------------------------------------------- */
/*  9. agent_tool_log Agent 工具调用审计日志                                     */
/* -------------------------------------------------------------------------- */

export const agentToolLog = sqliteTable(
  'agent_tool_log',
  {
    id: pk(),
    sessionId: text('session_id')
      .notNull()
      .references(() => agentSession.id, { onDelete: 'cascade' }),
    /** 所属消息 ID，便于前端把日志挂到某条 assistant 消息下 */
    messageId: text('message_id'),
    /** 工具名，例如 listInspiration */
    toolName: text('tool_name').notNull(),
    /** 入参 JSON 文本 */
    args: text('args'),
    /** 返回结果文本（截断存储，避免超大） */
    result: text('result'),
    status: text('status')
      .$type<(typeof TOOL_LOG_STATUS)[number]>()
      .notNull()
      .default('ok'),
    error: text('error'),
    durationMs: integer('duration_ms').notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    index('agent_tool_log_session_idx').on(t.sessionId),
    index('agent_tool_log_created_idx').on(t.createdAt),
  ],
);

/* -------------------------------------------------------------------------- */
/*  关系定义                                                                    */
/* -------------------------------------------------------------------------- */

export const agentSessionRelations = relations(agentSession, ({ many }) => ({
  toolLogs: many(agentToolLog),
}));

export const agentToolLogRelations = relations(agentToolLog, ({ one }) => ({
  session: one(agentSession, {
    fields: [agentToolLog.sessionId],
    references: [agentSession.id],
  }),
}));

/* -------------------------------------------------------------------------- */
/*  类型导出（Drizzle 推导，供前端 / API 复用）                                   */
/* -------------------------------------------------------------------------- */

export type Event = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;

export type TodoItem = typeof todoItems.$inferSelect;
export type NewTodoItem = typeof todoItems.$inferInsert;

export type AiHot = typeof aiHot.$inferSelect;
export type NewAiHot = typeof aiHot.$inferInsert;

export type DailyReview = typeof dailyReview.$inferSelect;
export type NewDailyReview = typeof dailyReview.$inferInsert;

export type Inspiration = typeof inspiration.$inferSelect;
export type NewInspiration = typeof inspiration.$inferInsert;

export type PromptTemplate = typeof promptTemplates.$inferSelect;
export type NewPromptTemplate = typeof promptTemplates.$inferInsert;

export type ClipboardSnapshot = typeof clipboardSnapshots.$inferSelect;
export type NewClipboardSnapshot = typeof clipboardSnapshots.$inferInsert;

export type AgentSession = typeof agentSession.$inferSelect;
export type NewAgentSession = typeof agentSession.$inferInsert;

export type AgentToolLog = typeof agentToolLog.$inferSelect;
export type NewAgentToolLog = typeof agentToolLog.$inferInsert;
