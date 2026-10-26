/**
 * 全局搜索服务
 * ----------------------------------------------------------------------------
 * 策略（与产品约束一致）：
 *   1. SQLite 精确匹配（LIKE %q%）覆盖所有表的标题类字段 —— 快、准。
 *   2. fuse.js 模糊补充：当精确命中不足时，拉取近期画布节点正文做模糊检索，
 *      解决「记得内容但记不住标题」的场景。
 *   3. 结果按 kind 分组，前端统一渲染 + 键盘上下选择。
 */
import Fuse from 'fuse.js';
import { desc, like, or, sql } from 'drizzle-orm';
import { db } from '@/db';
import {
  agentSession,
  canvas,
  canvasNode,
  dailyReview,
  inspiration,
  todoItems,
} from '@/db/schema';
import { stripMarkdown, truncate } from '@/lib/utils';

export type SearchKind = 'todo' | 'inspiration' | 'canvas' | 'node' | 'review' | 'session';

export interface SearchHit {
  id: string;
  kind: SearchKind;
  title: string;
  snippet: string;
  /** 前端 router.push 的目标地址 */
  href: string;
  /** 0-1，越小越相关（模糊检索时用于排序） */
  score?: number;
}

export interface SearchResult {
  query: string;
  hits: SearchHit[];
  /** 是否触发了 fuse 模糊补充 */
  fuzzy: boolean;
}

const PER_TABLE_LIMIT = 8;
const NODE_FUZZY_POOL = 300;

/** 生成 LIKE 模式，转义 % _ \ */
function likePattern(q: string): string {
  const escaped = q.replace(/[\\%_]/g, (m) => `\\${m}`);
  return `%${escaped}%`;
}

export function searchAll(rawQuery: string): SearchResult {
  const query = rawQuery.trim();
  if (!query) return { query, hits: [], fuzzy: false };

  const pattern = likePattern(query);
  const hits: SearchHit[] = [];

  /* ------------------------------ 1. 精确匹配 ------------------------------ */

  // 待办
  const todos = db
    .select()
    .from(todoItems)
    .where(or(like(todoItems.title, pattern), like(todoItems.description, pattern)))
    .orderBy(desc(todoItems.updatedAt))
    .limit(PER_TABLE_LIMIT)
    .all();

  for (const t of todos) {
    hits.push({
      id: t.id,
      kind: 'todo',
      title: t.title,
      snippet: t.description ? truncate(stripMarkdown(t.description), 60) : '',
      href: '/todo',
    });
  }

  // 灵感
  const insp = db
    .select()
    .from(inspiration)
    .where(or(like(inspiration.title, pattern), like(inspiration.content, pattern)))
    .orderBy(desc(inspiration.updatedAt))
    .limit(PER_TABLE_LIMIT)
    .all();

  for (const i of insp) {
    hits.push({
      id: i.id,
      kind: 'inspiration',
      title: i.title,
      snippet: truncate(stripMarkdown(i.content), 60),
      href: '/inspiration',
    });
  }

  // 画布
  const canvases = db
    .select()
    .from(canvas)
    .where(or(like(canvas.name, pattern), like(canvas.description, pattern)))
    .orderBy(desc(canvas.updatedAt))
    .limit(PER_TABLE_LIMIT)
    .all();

  for (const c of canvases) {
    hits.push({
      id: c.id,
      kind: 'canvas',
      title: c.name,
      snippet: c.description ? truncate(stripMarkdown(c.description), 60) : '',
      href: `/canvas/${c.id}`,
    });
  }

  // 画布节点（标题 + 正文）
  const nodes = db
    .select({
      id: canvasNode.id,
      canvasId: canvasNode.canvasId,
      nodeType: canvasNode.nodeType,
      title: canvasNode.title,
      content: canvasNode.content,
      canvasName: canvas.name,
    })
    .from(canvasNode)
    .leftJoin(canvas, sql`${canvas.id} = ${canvasNode.canvasId}`)
    .where(or(like(canvasNode.title, pattern), like(canvasNode.content, pattern)))
    .limit(PER_TABLE_LIMIT)
    .all();

  for (const n of nodes) {
    hits.push({
      id: n.id,
      kind: 'node',
      title: n.title || `${n.canvasName ?? '画布'} · ${n.nodeType}`,
      snippet: truncate(stripMarkdown(n.content), 70),
      href: `/canvas/${n.canvasId}?focus=${n.id}`,
    });
  }

  // 复盘
  const reviews = db
    .select()
    .from(dailyReview)
    .where(or(like(dailyReview.content, pattern), like(dailyReview.summary, pattern)))
    .orderBy(desc(dailyReview.reviewDate))
    .limit(4)
    .all();

  for (const r of reviews) {
    hits.push({
      id: r.id,
      kind: 'review',
      title: `${r.reviewDate} 复盘`,
      snippet: truncate(stripMarkdown(r.summary ?? r.content), 60),
      href: `/review?date=${r.reviewDate}`,
    });
  }

  // Agent 会话
  const sessions = db
    .select()
    .from(agentSession)
    .where(like(agentSession.title, pattern))
    .orderBy(desc(agentSession.updatedAt))
    .limit(4)
    .all();

  for (const s of sessions) {
    hits.push({
      id: s.id,
      kind: 'session',
      title: s.title,
      snippet: `${s.messageCount} 条消息`,
      href: `/agent?session=${s.id}`,
    });
  }

  /* --------------------------- 2. fuse 模糊补充 --------------------------- */

  let fuzzy = false;
  const nodeHitCount = hits.filter((h) => h.kind === 'node').length;

  if (nodeHitCount < 3) {
    const pool = db
      .select({
        id: canvasNode.id,
        canvasId: canvasNode.canvasId,
        nodeType: canvasNode.nodeType,
        title: canvasNode.title,
        content: canvasNode.content,
        canvasName: canvas.name,
      })
      .from(canvasNode)
      .leftJoin(canvas, sql`${canvas.id} = ${canvasNode.canvasId}`)
      .where(or(sql`${canvasNode.nodeType} = 'prompt'`, sql`${canvasNode.nodeType} = 'note'`))
      .orderBy(desc(canvasNode.updatedAt))
      .limit(NODE_FUZZY_POOL)
      .all();

    const fuse = new Fuse(pool, {
      keys: [
        { name: 'title', weight: 0.4 },
        { name: 'content', weight: 0.6 },
      ],
      threshold: 0.4,
      ignoreLocation: true,
      minMatchCharLength: 2,
      includeScore: true,
    });

    const existing = new Set(hits.map((h) => h.id));
    const fuzzyHits = fuse
      .search(query)
      .filter((r) => !existing.has(r.item.id))
      .slice(0, 6);

    for (const r of fuzzyHits) {
      hits.push({
        id: r.item.id,
        kind: 'node',
        title: r.item.title || `${r.item.canvasName ?? '画布'} · ${r.item.nodeType}`,
        snippet: truncate(stripMarkdown(r.item.content), 70),
        href: `/canvas/${r.item.canvasId}?focus=${r.item.id}`,
        score: r.score ?? 1,
      });
      fuzzy = true;
    }
  }

  return { query, hits, fuzzy };
}
