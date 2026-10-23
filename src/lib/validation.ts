import { z } from 'zod';
import {
  CLIPBOARD_TYPE,
  INSPIRATION_STATUS,
  INSPIRATION_TYPE,
  TODO_PRIORITY,
  TODO_STATUS,
} from '@/db/schema';

/**
 * 全局 Zod 校验：API Route 入参 + 前端表单共用同一份 schema，
 * 保证「前端校验 = 后端校验」，避免两处漂移。
 */

const dateKey = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式应为 YYYY-MM-DD');

const tagList = z.array(z.string().min(1)).max(20).optional();

/* -------------------------------- 灵感素材 -------------------------------- */

export const inspirationCreateSchema = z.object({
  title: z.string().min(1, '标题不能为空').max(200),
  summary: z.string().max(500).optional().nullable(),
  content: z.string().max(200_000).optional().nullable(),
  type: z.enum(INSPIRATION_TYPE).default('note'),
  status: z.enum(INSPIRATION_STATUS).default('ongoing'),
  progress: z.number().int().min(0).max(100).default(0),
  tags: tagList,
  localPath: z.string().max(500).optional().nullable(),
  coverImage: z.string().max(500).optional().nullable(),
  isFavorite: z.boolean().optional(),
});

export const inspirationUpdateSchema = inspirationCreateSchema.partial();

export type InspirationCreateInput = z.infer<typeof inspirationCreateSchema>;
export type InspirationUpdateInput = z.infer<typeof inspirationUpdateSchema>;

/* ---------------------------------- 待办 --------------------------------- */

export const todoCreateSchema = z.object({
  title: z.string().min(1, '任务标题不能为空').max(200),
  note: z.string().max(2000).optional().nullable(),
  status: z.enum(TODO_STATUS).default('pending'),
  priority: z.enum(TODO_PRIORITY).default('medium'),
  planDate: dateKey,
  dueDate: dateKey.optional().nullable(),
  tags: tagList,
  source: z.string().max(50).optional(),
  estimateMin: z.number().int().min(0).max(1440).optional().nullable(),
  sortOrder: z.number().int().optional(),
});

export const todoUpdateSchema = todoCreateSchema.partial();

export type TodoCreateInput = z.infer<typeof todoCreateSchema>;
export type TodoUpdateInput = z.infer<typeof todoUpdateSchema>;

/* ---------------------------------- 日程 --------------------------------- */

export const eventCreateSchema = z.object({
  title: z.string().min(1, '日程标题不能为空').max(200),
  description: z.string().max(5000).optional().nullable(),
  /** ISO 字符串，前端用 datetime-local 转换 */
  startAt: z.string().min(1, '请选择开始时间'),
  endAt: z.string().optional().nullable(),
  allDay: z.boolean().optional(),
  location: z.string().max(200).optional().nullable(),
  category: z.string().max(50).optional().nullable(),
  tags: tagList,
  remindAt: z.string().optional().nullable(),
  isDone: z.boolean().optional(),
});

export const eventUpdateSchema = eventCreateSchema.partial();

export type EventCreateInput = z.infer<typeof eventCreateSchema>;

/* -------------------------------- AI 热点 -------------------------------- */

export const aiHotCreateSchema = z.object({
  title: z.string().min(1, '标题不能为空').max(300),
  summary: z.string().max(1000).optional().nullable(),
  content: z.string().max(100_000).optional().nullable(),
  source: z.string().max(100).optional().nullable(),
  sourceUrl: z.string().max(1000).optional().nullable(),
  category: z.string().max(50).optional().nullable(),
  tags: tagList,
  heat: z.number().int().min(0).max(100).default(0),
  publishedAt: z.string().optional().nullable(),
  isStarred: z.boolean().optional(),
});

export const aiHotUpdateSchema = aiHotCreateSchema.partial();

export type AiHotCreateInput = z.infer<typeof aiHotCreateSchema>;

/* --------------------------------- 复盘 ---------------------------------- */

export const reviewUpsertSchema = z.object({
  reviewDate: dateKey,
  summary: z.string().max(2000).optional().nullable(),
  wellDone: z.string().max(5000).optional().nullable(),
  problems: z.string().max(5000).optional().nullable(),
  improvements: z.string().max(5000).optional().nullable(),
  tomorrowPlan: z.string().max(5000).optional().nullable(),
  content: z.string().max(100_000).optional().nullable(),
  moodScore: z.number().int().min(1).max(5).optional().nullable(),
  energyScore: z.number().int().min(1).max(5).optional().nullable(),
  tags: tagList,
});

export type ReviewUpsertInput = z.infer<typeof reviewUpsertSchema>;

/* ------------------------------- 提示词模板 ------------------------------- */

export const promptTemplateCreateSchema = z.object({
  name: z.string().min(1, '模板名称不能为空').max(200),
  description: z.string().max(1000).optional().nullable(),
  content: z.string().min(1, '模板内容不能为空').max(100_000),
  category: z.string().max(50).optional().nullable(),
  tags: tagList,
  model: z.string().max(100).optional().nullable(),
});

export const promptTemplateUpdateSchema = promptTemplateCreateSchema.partial();

export type PromptTemplateCreateInput = z.infer<typeof promptTemplateCreateSchema>;

/* -------------------------------- 剪贴板 --------------------------------- */

export const clipboardCreateSchema = z.object({
  content: z.string().min(1).max(50_000),
  contentType: z.enum(CLIPBOARD_TYPE).optional(),
  sourceApp: z.string().max(100).optional().nullable(),
});

export type ClipboardCreateInput = z.infer<typeof clipboardCreateSchema>;

/* ------------------------------ Agent 会话 ------------------------------- */

export const agentSessionCreateSchema = z.object({
  title: z.string().max(200).optional(),
  mode: z.enum(['workbench', 'files']).default('workbench'),
  model: z.string().max(100).optional(),
});

export const agentChatSchema = z.object({
  sessionId: z.string().min(1).optional(),
  message: z.string().min(1, '消息不能为空').max(20_000),
  mode: z.enum(['workbench', 'files']).default('workbench'),
  model: z.string().max(100).optional(),
  /** 右键选中的页面文本，作为上下文附带 */
  selectedText: z.string().max(8000).optional(),
});

export type AgentChatInput = z.infer<typeof agentChatSchema>;

/* -------------------------------- 查询参数 ------------------------------- */

export const inspirationQuerySchema = z.object({
  keyword: z.string().optional(),
  status: z.enum(INSPIRATION_STATUS).optional(),
  type: z.enum(INSPIRATION_TYPE).optional(),
  tag: z.string().optional(),
  favorite: z.enum(['true', 'false']).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

export const todoQuerySchema = z.object({
  scope: z.enum(['today', 'week', 'all']).default('today'),
  status: z.enum(TODO_STATUS).optional(),
  date: dateKey.optional(),
});

export type TodoQuery = z.infer<typeof todoQuerySchema>;
