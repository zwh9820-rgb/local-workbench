'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
  Bot,
  Braces,
  CalendarDays,
  ClipboardCopy,
  Flame,
  Lightbulb,
  ListTodo,
  Loader2,
  NotebookPen,
  Search,
} from 'lucide-react';
import type { SearchGroup, SearchHit } from '@/app/api/search/route';
import { api, qs } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useUiStore } from '@/store/ui';

const GROUP_ICON: Record<string, ReactNode> = {
  inspiration: <Lightbulb size={13} />,
  todo: <ListTodo size={13} />,
  event: <CalendarDays size={13} />,
  'ai-hot': <Flame size={13} />,
  review: <NotebookPen size={13} />,
  'prompt-template': <Braces size={13} />,
  clipboard: <ClipboardCopy size={13} />,
  agent: <Bot size={13} />,
};

/** 命中关键词高亮 */
function Highlight({ text, keyword }: { text: string; keyword: string }) {
  if (!keyword.trim()) return <>{text}</>;
  const parts = text.split(new RegExp(`(${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
  return (
    <>
      {parts.map((p, i) =>
        p.toLowerCase() === keyword.toLowerCase() ? (
          <mark key={i} className="rounded bg-brand-100 px-0.5 text-brand-700">
            {p}
          </mark>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

/**
 * 全局搜索面板（Ctrl+K）
 * 三层检索在后端完成：SQLite LIKE 精确 + fuse 模糊。
 */
export function GlobalSearch() {
  const open = useUiStore((s) => s.searchOpen);
  const setOpen = useUiStore((s) => s.setSearchOpen);
  const router = useRouter();

  const [query, setQuery] = useState('');
  const [groups, setGroups] = useState<SearchGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // 打开时聚焦并重置
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 30);
      setActiveIndex(0);
    } else {
      setQuery('');
      setGroups([]);
    }
  }, [open]);

  // 防抖检索
  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (!q) {
      setGroups([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const data = await api.get<{ groups: SearchGroup[]; total: number }>(
          `/api/search${qs({ q })}`,
        );
        setGroups(data.groups);
        setActiveIndex(0);
      } catch {
        setGroups([]);
      } finally {
        setLoading(false);
      }
    }, 180);
    return () => clearTimeout(timer);
  }, [query, open]);

  /** 扁平化，便于上下键选择 */
  const flat = useMemo(
    () => groups.flatMap((g) => g.hits.map((h) => ({ group: g.label, hit: h }))),
    [groups],
  );

  const go = (hit: SearchHit) => {
    setOpen(false);
    router.push(hit.href);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, flat.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const target = flat[activeIndex];
      if (target) go(target.hit);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  // 选中项滚动进视野
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${activeIndex}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  if (!open) return null;

  let cursor = -1;

  return (
    <div className="fixed inset-0 z-[55] flex items-start justify-center px-4 pt-[12vh]">
      <div className="fixed inset-0 bg-brand-900/25 backdrop-blur-[2px]" onClick={() => setOpen(false)} />
      <div className="relative z-10 w-full max-w-2xl animate-slide-up overflow-hidden rounded-xl border border-[var(--border-soft)] bg-paper-card shadow-float">
        {/* 输入区 */}
        <div className="flex items-center gap-2 border-b border-[var(--border-soft)] px-4 py-3">
          <Search size={16} className="shrink-0 text-brand-400" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="搜索灵感、待办、日程、复盘、模板、会话…"
            className="h-6 flex-1 bg-transparent text-sm text-ink-900 outline-none placeholder:text-ink-500/70"
          />
          {loading && <Loader2 size={14} className="animate-spin text-brand-400" />}
          <kbd className="rounded border border-[var(--border-soft)] bg-brand-50 px-1.5 py-0.5 text-[10px] text-ink-500">
            Esc
          </kbd>
        </div>

        {/* 结果区 */}
        <div ref={listRef} className="max-h-[58vh] overflow-y-auto px-2 py-2">
          {!query.trim() && (
            <div className="px-2 py-6 text-center">
              <p className="text-xs text-ink-500">
                输入关键词开始检索 · 支持标题 / 正文 / 标签模糊匹配
              </p>
              <div className="mt-3 flex flex-wrap justify-center gap-1.5">
                {['提示词', 'comfyui', '漫剧', '短视频'].map((k) => (
                  <button
                    key={k}
                    onClick={() => setQuery(k)}
                    className="rounded-md bg-brand-50 px-2 py-1 text-[11px] text-brand-600 hover:bg-brand-100"
                  >
                    {k}
                  </button>
                ))}
              </div>
            </div>
          )}

          {query.trim() && !loading && flat.length === 0 && (
            <div className="px-2 py-8 text-center text-xs text-ink-500">
              没有匹配结果，换个关键词试试
            </div>
          )}

          {groups.map((g) => (
            <div key={g.key} className="mb-1">
              <div className="flex items-center gap-1.5 px-2 py-1.5 text-[10px] font-medium uppercase tracking-wide text-ink-500">
                {GROUP_ICON[g.key]}
                {g.label}
                <span className="text-ink-500/60">{g.hits.length}</span>
              </div>
              {g.hits.map((hit) => {
                cursor += 1;
                const idx = cursor;
                return (
                  <button
                    key={`${g.key}-${hit.id}`}
                    data-idx={idx}
                    onMouseEnter={() => setActiveIndex(idx)}
                    onClick={() => go(hit)}
                    className={cn(
                      'flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors',
                      idx === activeIndex ? 'bg-brand-50' : 'hover:bg-brand-50/60',
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-[13px] font-medium text-ink-900">
                          <Highlight text={hit.title} keyword={query.trim()} />
                        </span>
                        {hit.match === 'exact' ? (
                          <span className="shrink-0 rounded bg-brand-100 px-1 text-[9px] text-brand-600">
                            精确
                          </span>
                        ) : (
                          <span className="shrink-0 rounded bg-brand-50 px-1 text-[9px] text-ink-500">
                            模糊
                          </span>
                        )}
                      </div>
                      {hit.snippet && (
                        <p className="mt-0.5 truncate text-[11px] text-ink-500">
                          <Highlight text={hit.snippet} keyword={query.trim()} />
                        </p>
                      )}
                    </div>
                    {hit.meta && (
                      <span className="mt-0.5 shrink-0 text-[10px] text-ink-500">{hit.meta}</span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* 底部提示 */}
        <div className="flex items-center justify-between border-t border-[var(--border-soft)] px-4 py-2 text-[10px] text-ink-500">
          <span className="flex items-center gap-2">
            <kbd className="rounded border border-[var(--border-soft)] px-1">↑</kbd>
            <kbd className="rounded border border-[var(--border-soft)] px-1">↓</kbd>
            选择
            <kbd className="rounded border border-[var(--border-soft)] px-1">Enter</kbd>
            打开
          </span>
          <span>SQLite 精确匹配 + fuse 模糊检索</span>
        </div>
      </div>
    </div>
  );
}
