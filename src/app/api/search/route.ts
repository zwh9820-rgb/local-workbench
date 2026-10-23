import Fuse from 'fuse.js';
import { desc, like, or } from 'drizzle-orm';
import { db } from '@/db';
import {
  agentSession,
  aiHot,
  clipboardSnapshots,
  dailyReview,
  events,
  inspiration,
  promptTemplates,
  todoItems,
} from '@/db/schema';
import { ok } from '@/lib/http';
import { truncate } from '@/lib/utils';
import { toDateKey } from '@/lib/date';

/**
 * 全局搜索（三层检索）：
 *  1) SQLite 精确匹配：title/summary/content LIKE %q%
 *  2) fuse.js 模糊检索：对最近 N 条候选做相似度排序
 *  3) 合并去重，精确命中优先
 *
 * 只读接口，供 Ctrl+K 全局搜索面板使用。
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export type SearchHit = {
  id: string;
  title: string;
  snippet: string;
  meta?: string;
  href: string;
  match: 'exact' | 'fuzzy';
  score: number;
};

export type SearchGroup = {
  key: string;
  label: string;
  hits: SearchHit[];
};

const POOL = 300;
const PER_GROUP = 6;

function fuse<T>(pool: T[], keys: string[], q: string) {
  const f = new Fuse(pool, {
    keys,
    threshold: 0.45,
    ignoreLocation: true,
    includeScore: true,
    minMatchCharLength: 1,
  });
  return f.search(q);
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get('q') ?? '').trim();
  if (!q) return ok({ query: q, groups: [] as SearchGroup[], total: 0 });

  const kw = `%${q}%`;

  const [
    inspExact,
    inspPool,
    todoExact,
    todoPool,
    eventExact,
    aiHotExact,
    reviewExact,
    templateExact,
    clipboardExact,
    sessionPool,
  ] = await Promise.all([
    db
      .select()
      .from(inspiration)
      .where(
        or(
          like(inspiration.title, kw),
          like(inspiration.summary, kw),
          like(inspiration.content, kw),
        ),
      )
      .orderBy(desc(inspiration.updatedAt))
      .limit(PER_GROUP),
    db.select().from(inspiration).orderBy(desc(inspiration.updatedAt)).limit(POOL),
    db
      .select()
      .from(todoItems)
      .where(or(like(todoItems.title, kw), like(todoItems.note, kw)))
      .orderBy(desc(todoItems.updatedAt))
      .limit(PER_GROUP),
    db.select().from(todoItems).orderBy(desc(todoItems.updatedAt)).limit(POOL),
    db
      .select()
      .from(events)
      .where(or(like(events.title, kw), like(events.description, kw)))
      .orderBy(desc(events.startAt))
      .limit(PER_GROUP),
    db
      .select()
      .from(aiHot)
      .where(or(like(aiHot.title, kw), like(aiHot.summary, kw), like(aiHot.content, kw)))
      .orderBy(desc(aiHot.createdAt))
      .limit(PER_GROUP),
    db
      .select()
      .from(dailyReview)
      .where(
        or(
          like(dailyReview.summary, kw),
          like(dailyReview.content, kw),
          like(dailyReview.reviewDate, kw),
        ),
      )
      .orderBy(desc(dailyReview.reviewDate))
      .limit(PER_GROUP),
    db
      .select()
      .from(promptTemplates)
      .where(
        or(
          like(promptTemplates.name, kw),
          like(promptTemplates.description, kw),
          like(promptTemplates.content, kw),
        ),
      )
      .limit(PER_GROUP),
    db
      .select()
      .from(clipboardSnapshots)
      .where(like(clipboardSnapshots.content, kw))
      .orderBy(desc(clipboardSnapshots.createdAt))
      .limit(PER_GROUP),
    db.select().from(agentSession).orderBy(desc(agentSession.updatedAt)).limit(POOL),
  ]);

  const groups: SearchGroup[] = [];

  /* ------------------------------- 灵感素材 ------------------------------- */
  {
    const exactIds = new Set(inspExact.map((i) => i.id));
    const hits: SearchHit[] = inspExact.map((i) => ({
      id: i.id,
      title: i.title,
      snippet: truncate(i.summary || i.content, 80),
      meta: i.tags?.join(' · ') || i.type,
      href: `/inspiration?id=${i.id}`,
      match: 'exact',
      score: 0,
    }));

    fuse(inspPool, ['title', 'summary', 'content', 'tags'], q)
      .filter((r) => !exactIds.has(r.item.id))
      .slice(0, PER_GROUP)
      .forEach((r) => {
        hits.push({
          id: r.item.id,
          title: r.item.title,
          snippet: truncate(r.item.summary || r.item.content, 80),
          meta: r.item.tags?.join(' · ') || r.item.type,
          href: `/inspiration?id=${r.item.id}`,
          match: 'fuzzy',
          score: r.score ?? 1,
        });
      });

    if (hits.length) groups.push({ key: 'inspiration', label: '灵感素材', hits: hits.slice(0, PER_GROUP) });
  }

  /* --------------------------------- 待办 --------------------------------- */
  {
    const exactIds = new Set(todoExact.map((t) => t.id));
    const hits: SearchHit[] = todoExact.map((t) => ({
      id: t.id,
      title: t.title,
      snippet: truncate(t.note, 80) || t.planDate,
      meta: t.status === 'done' ? '已完成' : t.planDate,
      href: `/today-todo?id=${t.id}`,
      match: 'exact',
      score: 0,
    }));

    fuse(todoPool, ['title', 'note', 'tags'], q)
      .filter((r) => !exactIds.has(r.item.id))
      .slice(0, PER_GROUP)
      .forEach((r) => {
        hits.push({
          id: r.item.id,
          title: r.item.title,
          snippet: truncate(r.item.note, 80) || r.item.planDate,
          meta: r.item.planDate,
          href: `/today-todo?id=${r.item.id}`,
          match: 'fuzzy',
          score: r.score ?? 1,
        });
      });

    if (hits.length) groups.push({ key: 'todo', label: '待办任务', hits: hits.slice(0, PER_GROUP) });
  }

  /* --------------------------------- 日程 --------------------------------- */
  if (eventExact.length) {
    groups.push({
      key: 'event',
      label: '日历日程',
      hits: eventExact.map((e) => ({
        id: e.id,
        title: e.title,
        snippet: truncate(e.description, 80),
        meta: toDateKey(new Date(e.startAt)),
        href: `/calendar?date=${toDateKey(new Date(e.startAt))}`,
        match: 'exact',
        score: 0,
      })),
    });
  }

  /* -------------------------------- AI 热点 ------------------------------- */
  if (aiHotExact.length) {
    groups.push({
      key: 'ai-hot',
      label: 'AI 热点',
      hits: aiHotExact.map((a) => ({
        id: a.id,
        title: a.title,
        snippet: truncate(a.summary || a.content, 80),
        meta: a.source ?? undefined,
        href: `/ai-hot?id=${a.id}`,
        match: 'exact',
        score: 0,
      })),
    });
  }

  /* --------------------------------- 复盘 --------------------------------- */
  if (reviewExact.length) {
    groups.push({
      key: 'review',
      label: '每日复盘',
      hits: reviewExact.map((r) => ({
        id: r.id,
        title: `${r.reviewDate} 复盘`,
        snippet: truncate(r.summary || r.content, 80),
        href: `/review?date=${r.reviewDate}`,
        match: 'exact',
        score: 0,
      })),
    });
  }

  /* ------------------------------- 提示词模板 ------------------------------ */
  if (templateExact.length) {
    groups.push({
      key: 'prompt-template',
      label: '提示词模板',
      hits: templateExact.map((t) => ({
        id: t.id,
        title: t.name,
        snippet: truncate(t.description || t.content, 80),
        meta: t.category ?? undefined,
        href: `/prompt-template?id=${t.id}`,
        match: 'exact',
        score: 0,
      })),
    });
  }

  /* -------------------------------- 剪贴板 -------------------------------- */
  if (clipboardExact.length) {
    groups.push({
      key: 'clipboard',
      label: '剪贴板快照',
      hits: clipboardExact.map((c) => ({
        id: c.id,
        title: truncate(c.content, 40),
        snippet: truncate(c.content, 90),
        meta: c.sourceApp ?? undefined,
        href: `/inspiration?clipboard=${c.id}`,
        match: 'exact',
        score: 0,
      })),
    });
  }

  /* ------------------------------- Agent 会话 ----------------------------- */
  {
    const hits: SearchHit[] = fuse(sessionPool, ['title'], q)
      .slice(0, PER_GROUP)
      .map((r) => ({
        id: r.item.id,
        title: r.item.title,
        snippet: `${r.item.messageCount} 条消息`,
        meta: r.item.mode === 'files' ? '含文件读取' : '工作台助手',
        href: `/agent?session=${r.item.id}`,
        match: 'fuzzy' as const,
        score: r.score ?? 1,
      }));
    if (hits.length) groups.push({ key: 'agent', label: 'Agent 会话', hits });
  }

  const total = groups.reduce((n, g) => n + g.hits.length, 0);
  return ok({ query: q, groups, total });
}
