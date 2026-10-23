import Fuse from 'fuse.js';
import { and, asc, desc, eq, gte, like, lte, or, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import {
  agentToolLog,
  aiHot,
  dailyReview,
  inspiration,
  promptTemplates,
  todoItems,
  type AgentMode,
} from '@/db/schema';
import {
  endOfWeek,
  fromDateKey,
  getWeekKey,
  startOfWeek,
  toDateKey,
  todayKey,
} from '@/lib/date';
import { truncate } from '@/lib/utils';
import { readWhitelistFile } from './files';
import { zodToJsonSchema } from './zod-schema';

/* -------------------------------------------------------------------------- */
/*  类型                                                                        */
/* -------------------------------------------------------------------------- */

export type ToolContext = {
  sessionId: string;
  mode: AgentMode;
  /** 关联的 assistant 消息 ID，便于前端把日志挂到消息上 */
  messageId?: string;
};

export type AgentTool = {
  name: string;
  description: string;
  schema: z.ZodObject<z.ZodRawShape>;
  /** 仅 files 模式可用 */
  requiresFiles?: boolean;
  execute: (args: Record<string, unknown>, ctx: ToolContext) => Promise<unknown>;
};

const LIMIT_DEFAULT = 10;

/* -------------------------------------------------------------------------- */
/*  1. listInspiration 检索灵感素材库                                            */
/* -------------------------------------------------------------------------- */

const listInspirationArgs = z.object({
  keyword: z.string().optional().describe('关键词，匹配标题/摘要/正文/标签'),
  tag: z.string().optional().describe('按单个标签筛选'),
  status: z
    .enum(['ongoing', 'paused', 'finished', 'abandoned'])
    .optional()
    .describe('状态筛选：进行中/暂停/已完成/已放弃'),
  type: z
    .enum(['prompt', 'comfyui', 'script', 'video', 'note'])
    .optional()
    .describe('类型：提示词/ComfyUI/漫剧脚本/短视频/笔记'),
  limit: z.number().int().min(1).max(50).optional().describe('返回条数，默认 10'),
});

/* -------------------------------------------------------------------------- */
/*  2. createInspiration 新建灵感                                               */
/* -------------------------------------------------------------------------- */

const createInspirationArgs = z.object({
  title: z.string().min(1).describe('标题'),
  content: z.string().optional().describe('Markdown 正文，可含代码块'),
  summary: z.string().optional().describe('一句话摘要'),
  type: z
    .enum(['prompt', 'comfyui', 'script', 'video', 'note'])
    .optional()
    .describe('类型，默认 note'),
  status: z
    .enum(['ongoing', 'paused', 'finished', 'abandoned'])
    .optional()
    .describe('状态，默认 ongoing'),
  tags: z.array(z.string()).optional().describe('标签数组'),
  localPath: z.string().optional().describe('本地文件路径（仅记录，不读取）'),
});

/* -------------------------------------------------------------------------- */
/*  3. updateInspiration 修改灵感                                               */
/* -------------------------------------------------------------------------- */

const updateInspirationArgs = z.object({
  id: z.string().optional().describe('灵感 ID（优先使用）'),
  title: z.string().optional().describe('按标题模糊定位（没有 id 时使用）'),
  newTitle: z.string().optional().describe('修改后的标题'),
  status: z
    .enum(['ongoing', 'paused', 'finished', 'abandoned'])
    .optional()
    .describe('新状态'),
  progress: z.number().int().min(0).max(100).optional().describe('进度 0-100'),
  content: z.string().optional().describe('替换正文'),
  summary: z.string().optional().describe('替换摘要'),
  tags: z.array(z.string()).optional().describe('替换标签'),
});

/* -------------------------------------------------------------------------- */
/*  4. listTodo 查询待办                                                        */
/* -------------------------------------------------------------------------- */

const listTodoArgs = z.object({
  scope: z.enum(['today', 'week']).optional().describe('today=今日，week=本周，默认 today'),
  status: z.enum(['pending', 'doing', 'done']).optional().describe('状态筛选'),
});

/* -------------------------------------------------------------------------- */
/*  5. createTodo 新建待办                                                      */
/* -------------------------------------------------------------------------- */

const createTodoArgs = z.object({
  title: z.string().min(1).describe('任务标题'),
  planDate: z
    .string()
    .optional()
    .describe('计划日期 YYYY-MM-DD，默认今天'),
  priority: z.enum(['low', 'medium', 'high']).optional().describe('优先级，默认 medium'),
  note: z.string().optional().describe('备注'),
  tags: z.array(z.string()).optional().describe('标签'),
});

/* -------------------------------------------------------------------------- */
/*  6. toggleTodo 勾选完成                                                      */
/* -------------------------------------------------------------------------- */

const toggleTodoArgs = z.object({
  id: z.string().optional().describe('待办 ID'),
  title: z.string().optional().describe('按标题模糊定位（没有 id 时使用）'),
  done: z.boolean().optional().describe('true=标记完成，false=取消完成，默认 true'),
});

/* -------------------------------------------------------------------------- */
/*  7. createReview 生成复盘草稿                                                */
/* -------------------------------------------------------------------------- */

const createReviewArgs = z.object({
  date: z.string().optional().describe('复盘日期 YYYY-MM-DD，默认今天'),
  summary: z.string().optional().describe('一句话总结'),
  wellDone: z.string().optional().describe('做得好的事'),
  problems: z.string().optional().describe('遇到的问题'),
  improvements: z.string().optional().describe('改进措施'),
  tomorrowPlan: z.string().optional().describe('明日计划'),
  content: z.string().optional().describe('复盘正文 Markdown'),
  moodScore: z.number().int().min(1).max(5).optional().describe('心情 1-5'),
  energyScore: z.number().int().min(1).max(5).optional().describe('精力 1-5'),
});

/* -------------------------------------------------------------------------- */
/*  8. searchAll 全局跨表检索                                                   */
/* -------------------------------------------------------------------------- */

const searchAllArgs = z.object({
  keyword: z.string().min(1).describe('检索关键词'),
  limit: z.number().int().min(1).max(30).optional().describe('每类返回条数，默认 5'),
});

/* -------------------------------------------------------------------------- */
/*  9. readWhiteListFile 读取素材文件（仅 files 模式）                            */
/* -------------------------------------------------------------------------- */

const readFileArgs = z.object({
  path: z
    .string()
    .min(1)
    .describe('相对素材目录 public/assets/ai-material 的路径，例如 workflows/i2v.json'),
});

/* -------------------------------------------------------------------------- */
/*  工具实现                                                                    */
/* -------------------------------------------------------------------------- */

/** 统一收敛为「可读的精简对象」，避免把整行数据都塞给模型 */
const pickInspiration = (row: typeof inspiration.$inferSelect) => ({
  id: row.id,
  title: row.title,
  type: row.type,
  status: row.status,
  progress: row.progress,
  tags: row.tags ?? [],
  summary: truncate(row.summary || row.content, 120),
  localPath: row.localPath,
  updatedAt: toDateKey(new Date(row.updatedAt)),
});

const pickTodo = (row: typeof todoItems.$inferSelect) => ({
  id: row.id,
  title: row.title,
  status: row.status,
  priority: row.priority,
  planDate: row.planDate,
  dueDate: row.dueDate,
});

export const AGENT_TOOLS: AgentTool[] = [
  {
    name: 'listInspiration',
    description:
      '检索灵感素材库（提示词 / ComfyUI 工作流 / 漫剧脚本 / 短视频素材 / 笔记）。可按关键词、标签、状态、类型筛选。当用户问「我有哪些素材 / 进行中的项目」时优先调用。',
    schema: listInspirationArgs,
    async execute(args) {
      const a = listInspirationArgs.parse(args);
      const conds: SQL[] = [];

      if (a.keyword) {
        const kw = `%${a.keyword}%`;
        conds.push(
          or(
            like(inspiration.title, kw),
            like(inspiration.summary, kw),
            like(inspiration.content, kw),
            like(inspiration.tags, kw),
          ) as SQL,
        );
      }
      if (a.tag) conds.push(like(inspiration.tags, `%${a.tag}%`));
      if (a.status) conds.push(eq(inspiration.status, a.status));
      if (a.type) conds.push(eq(inspiration.type, a.type));

      const rows = await db
        .select()
        .from(inspiration)
        .where(conds.length ? and(...conds) : undefined)
        .orderBy(desc(inspiration.updatedAt))
        .limit(a.limit ?? LIMIT_DEFAULT);

      return { count: rows.length, items: rows.map(pickInspiration) };
    },
  },

  {
    name: 'createInspiration',
    description:
      '在灵感素材库新建一条记录。适合把对话中产生的提示词、工作流说明、脚本片段保存下来。创建后返回新条目 ID。',
    schema: createInspirationArgs,
    async execute(args) {
      const a = createInspirationArgs.parse(args);
      const [row] = await db
        .insert(inspiration)
        .values({
          title: a.title,
          content: a.content ?? '',
          summary: a.summary ?? truncate(a.content, 120),
          type: a.type ?? 'note',
          status: a.status ?? 'ongoing',
          tags: a.tags ?? [],
          localPath: a.localPath ?? null,
        })
        .returning();
      return { created: true, item: pickInspiration(row) };
    },
  },

  {
    name: 'updateInspiration',
    description:
      '修改灵感条目：更新状态、进度、标题、正文或标签。可用 id 精确定位，也可用标题模糊定位。',
    schema: updateInspirationArgs,
    async execute(args) {
      const a = updateInspirationArgs.parse(args);

      let targetId = a.id;
      if (!targetId && a.title) {
        const [found] = await db
          .select()
          .from(inspiration)
          .where(like(inspiration.title, `%${a.title}%`))
          .orderBy(desc(inspiration.updatedAt))
          .limit(1);
        targetId = found?.id;
      }
      if (!targetId) throw new Error('没有找到要修改的灵感，请提供 id 或更准确的标题');

      const patch: Record<string, unknown> = { updatedAt: new Date() };
      if (a.newTitle !== undefined) patch.title = a.newTitle;
      if (a.status !== undefined) patch.status = a.status;
      if (a.progress !== undefined) patch.progress = a.progress;
      if (a.content !== undefined) patch.content = a.content;
      if (a.summary !== undefined) patch.summary = a.summary;
      if (a.tags !== undefined) patch.tags = a.tags;

      const [row] = await db
        .update(inspiration)
        .set(patch)
        .where(eq(inspiration.id, targetId))
        .returning();

      if (!row) throw new Error('灵感不存在或已被删除');
      return { updated: true, item: pickInspiration(row) };
    },
  },

  {
    name: 'listTodo',
    description: '查询今日或本周的待办任务，可只看某个状态。',
    schema: listTodoArgs,
    async execute(args) {
      const a = listTodoArgs.parse(args);
      const conds: SQL[] = [];

      if ((a.scope ?? 'today') === 'today') {
        conds.push(eq(todoItems.planDate, todayKey()));
      } else {
        conds.push(gte(todoItems.planDate, toDateKey(startOfWeek())));
        conds.push(lte(todoItems.planDate, toDateKey(endOfWeek())));
      }
      if (a.status) conds.push(eq(todoItems.status, a.status));

      const rows = await db
        .select()
        .from(todoItems)
        .where(and(...conds))
        .orderBy(asc(todoItems.status), asc(todoItems.sortOrder));

      return {
        scope: a.scope ?? 'today',
        count: rows.length,
        done: rows.filter((r) => r.status === 'done').length,
        items: rows.map(pickTodo),
      };
    },
  },

  {
    name: 'createTodo',
    description: '新建一条待办任务，默认安排在今天。',
    schema: createTodoArgs,
    async execute(args) {
      const a = createTodoArgs.parse(args);
      const planDate = a.planDate ?? todayKey();

      const [row] = await db
        .insert(todoItems)
        .values({
          title: a.title,
          note: a.note ?? null,
          priority: a.priority ?? 'medium',
          planDate,
          weekKey: getWeekKey(fromDateKey(planDate)),
          tags: a.tags ?? [],
          source: 'agent',
          sortOrder: Date.now() % 100000,
        })
        .returning();

      return { created: true, item: pickTodo(row) };
    },
  },

  {
    name: 'toggleTodo',
    description: '把待办标记为完成或取消完成。可用 id 或标题模糊定位。',
    schema: toggleTodoArgs,
    async execute(args) {
      const a = toggleTodoArgs.parse(args);
      const done = a.done ?? true;

      let targetId = a.id;
      if (!targetId && a.title) {
        const [found] = await db
          .select()
          .from(todoItems)
          .where(like(todoItems.title, `%${a.title}%`))
          .orderBy(desc(todoItems.updatedAt))
          .limit(1);
        targetId = found?.id;
      }
      if (!targetId) throw new Error('没有找到对应待办，请提供 id 或更准确的标题');

      const [row] = await db
        .update(todoItems)
        .set({
          status: done ? 'done' : 'pending',
          completedAt: done ? new Date() : null,
          updatedAt: new Date(),
        })
        .where(eq(todoItems.id, targetId))
        .returning();

      if (!row) throw new Error('待办不存在');
      return { updated: true, item: pickTodo(row) };
    },
  },

  {
    name: 'createReview',
    description:
      '生成或更新某天的复盘草稿（一天一条，重复调用会覆盖当天内容）。可先把用户口述的复盘整理成结构化字段再调用。',
    schema: createReviewArgs,
    async execute(args) {
      const a = createReviewArgs.parse(args);
      const date = a.date ?? todayKey();

      const [row] = await db
        .insert(dailyReview)
        .values({
          reviewDate: date,
          summary: a.summary ?? null,
          wellDone: a.wellDone ?? null,
          problems: a.problems ?? null,
          improvements: a.improvements ?? null,
          tomorrowPlan: a.tomorrowPlan ?? null,
          content: a.content ?? '',
          moodScore: a.moodScore ?? null,
          energyScore: a.energyScore ?? null,
        })
        .onConflictDoUpdate({
          target: dailyReview.reviewDate,
          set: {
            summary: a.summary ?? null,
            wellDone: a.wellDone ?? null,
            problems: a.problems ?? null,
            improvements: a.improvements ?? null,
            tomorrowPlan: a.tomorrowPlan ?? null,
            content: a.content ?? '',
            moodScore: a.moodScore ?? null,
            energyScore: a.energyScore ?? null,
            updatedAt: new Date(),
          },
        })
        .returning();

      return { saved: true, reviewDate: row.reviewDate };
    },
  },

  {
    name: 'searchAll',
    description:
      '全局跨表模糊检索：灵感、待办、AI 热点、提示词模板、复盘。适合「我记得之前记过 XX」这类模糊回忆。',
    schema: searchAllArgs,
    async execute(args) {
      const a = searchAllArgs.parse(args);
      const limit = a.limit ?? 5;

      const [insp, todos, hots, templates, reviews] = await Promise.all([
        db.select().from(inspiration).limit(500),
        db.select().from(todoItems).limit(500),
        db.select().from(aiHot).limit(500),
        db.select().from(promptTemplates).limit(500),
        db.select().from(dailyReview).limit(200),
      ]);

      const fuseOpts = { threshold: 0.45, ignoreLocation: true, includeScore: true };

      const hits = [
        ...new Fuse(insp, { ...fuseOpts, keys: ['title', 'summary', 'content', 'tags'] })
          .search(a.keyword)
          .slice(0, limit)
          .map((r) => ({
            table: 'inspiration',
            id: r.item.id,
            title: r.item.title,
            snippet: truncate(r.item.summary || r.item.content, 100),
            extra: r.item.status,
            score: r.score ?? 1,
          })),
        ...new Fuse(todos, { ...fuseOpts, keys: ['title', 'note', 'tags'] })
          .search(a.keyword)
          .slice(0, limit)
          .map((r) => ({
            table: 'todo',
            id: r.item.id,
            title: r.item.title,
            snippet: r.item.planDate,
            extra: r.item.status,
            score: r.score ?? 1,
          })),
        ...new Fuse(hots, { ...fuseOpts, keys: ['title', 'summary', 'content', 'tags'] })
          .search(a.keyword)
          .slice(0, limit)
          .map((r) => ({
            table: 'ai_hot',
            id: r.item.id,
            title: r.item.title,
            snippet: truncate(r.item.summary, 100),
            extra: r.item.source,
            score: r.score ?? 1,
          })),
        ...new Fuse(templates, { ...fuseOpts, keys: ['name', 'description', 'content', 'tags'] })
          .search(a.keyword)
          .slice(0, limit)
          .map((r) => ({
            table: 'prompt_template',
            id: r.item.id,
            title: r.item.name,
            snippet: truncate(r.item.description || r.item.content, 100),
            extra: r.item.category,
            score: r.score ?? 1,
          })),
        ...new Fuse(reviews, { ...fuseOpts, keys: ['summary', 'content', 'wellDone', 'problems'] })
          .search(a.keyword)
          .slice(0, limit)
          .map((r) => ({
            table: 'daily_review',
            id: r.item.id,
            title: `${r.item.reviewDate} 复盘`,
            snippet: truncate(r.item.summary || r.item.content, 100),
            extra: null,
            score: r.score ?? 1,
          })),
      ];

      return {
        keyword: a.keyword,
        total: hits.length,
        hits: hits.sort((x, y) => x.score - y.score).slice(0, limit * 2),
      };
    },
  },

  {
    name: 'readWhiteListFile',
    description:
      '读取素材白名单目录（public/assets/ai-material）下的 md / json / txt 文本文件。仅当用户明确要求查看某个素材文件时调用；禁止访问该目录以外的任何路径。',
    schema: readFileArgs,
    requiresFiles: true,
    async execute(args) {
      const a = readFileArgs.parse(args);
      const file = readWhitelistFile(a.path);
      const limit = Number(process.env.AGENT_TOOL_RESULT_LIMIT ?? 4000);
      return {
        path: file.path,
        size: file.size,
        truncated: file.content.length > limit,
        content: file.content.slice(0, limit),
      };
    },
  },
];

/* -------------------------------------------------------------------------- */
/*  对外辅助                                                                    */
/* -------------------------------------------------------------------------- */

/** 当前模式可用的工具 */
export function getToolsForMode(mode: AgentMode): AgentTool[] {
  return AGENT_TOOLS.filter((t) => !t.requiresFiles || mode === 'files');
}

/** 生成 OpenAI function calling 的 tools 参数 */
export function toOpenAITools(mode: AgentMode) {
  return getToolsForMode(mode).map((t) => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: zodToJsonSchema(t.schema),
    },
  }));
}

export type ToolExecution = {
  toolName: string;
  args: Record<string, unknown>;
  result?: unknown;
  error?: string;
  status: 'ok' | 'error';
  durationMs: number;
  /** 给模型看的文本结果 */
  content: string;
};

/**
 * 执行单个工具：Zod 校验 → 运行 → 写审计日志。
 * 失败不抛给上层，而是把错误文本回灌给模型，让它自行纠正参数。
 */
export async function executeTool(
  name: string,
  rawArgs: string,
  ctx: ToolContext,
): Promise<ToolExecution> {
  const started = Date.now();
  const tool = getToolsForMode(ctx.mode).find((t) => t.name === name);

  let parsedArgs: Record<string, unknown> = {};
  try {
    parsedArgs = rawArgs ? (JSON.parse(rawArgs) as Record<string, unknown>) : {};
  } catch {
    parsedArgs = {};
  }

  const resultLimit = Number(process.env.AGENT_TOOL_RESULT_LIMIT ?? 4000);

  if (!tool) {
    const error = `工具不存在或当前模式不可用：${name}`;
    await logTool(ctx, name, rawArgs, error, 'error', Date.now() - started, error);
    return {
      toolName: name,
      args: parsedArgs,
      error,
      status: 'error',
      durationMs: Date.now() - started,
      content: error,
    };
  }

  try {
    const result = await tool.execute(parsedArgs, ctx);
    const content = JSON.stringify(result);
    const durationMs = Date.now() - started;

    await logTool(ctx, name, rawArgs, content, 'ok', durationMs);
    return {
      toolName: name,
      args: parsedArgs,
      result,
      status: 'ok',
      durationMs,
      content: content.length > resultLimit ? content.slice(0, resultLimit) : content,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : '工具执行失败';
    const durationMs = Date.now() - started;
    await logTool(ctx, name, rawArgs, null, 'error', durationMs, message);
    return {
      toolName: name,
      args: parsedArgs,
      error: message,
      status: 'error',
      durationMs,
      content: `工具执行出错：${message}`,
    };
  }
}

/** 写 agent_tool_log 审计日志 */
async function logTool(
  ctx: ToolContext,
  toolName: string,
  args: string,
  result: string | null,
  status: 'ok' | 'error',
  durationMs: number,
  error?: string,
) {
  try {
    await db.insert(agentToolLog).values({
      sessionId: ctx.sessionId,
      messageId: ctx.messageId ?? null,
      toolName,
      args: args.slice(0, 8000),
      result: result ? result.slice(0, 8000) : null,
      status,
      error: error ?? null,
      durationMs,
    });
  } catch (e) {
    console.error('[agent] 写工具日志失败', e);
  }
}
