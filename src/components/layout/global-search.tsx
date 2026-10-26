'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';
import {
  CheckSquare,
  CornerDownLeft,
  Frame,
  Lightbulb,
  NotebookPen,
  Search,
  Sparkles,
  SquareStack,
} from 'lucide-react';
import { useUIStore } from '@/store/ui';
import { cn } from '@/lib/utils';
import { Spinner } from '@/components/ui/card';
import type { SearchHit, SearchKind } from '@/server/search';

const KIND_META: Record<SearchKind, { label: string; icon: typeof Search }> = {
  todo: { label: '待办', icon: CheckSquare },
  inspiration: { label: '灵感', icon: Lightbulb },
  canvas: { label: '画布', icon: Frame },
  node: { label: '画布节点', icon: SquareStack },
  review: { label: '复盘', icon: NotebookPen },
  session: { label: '会话', icon: Sparkles },
};

const KIND_ORDER: SearchKind[] = [
  'todo',
  'inspiration',
  'canvas',
  'node',
  'review',
  'session',
];

export function GlobalSearch() {
  const open = useUIStore((s) => s.searchOpen);
  const close = useUIStore((s) => s.closeSearch);
  const router = useRouter();

  const [mounted, setMounted] = useState(false);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => setMounted(true), []);

  // 打开时重置 + 聚焦
  useEffect(() => {
    if (!open) return;
    setActive(0);
    const t = setTimeout(() => inputRef.current?.focus(), 30);
    return () => clearTimeout(t);
  }, [open]);

  // 关闭时清空，避免下次打开看到旧结果
  useEffect(() => {
    if (!open) {
      setQuery('');
      setHits([]);
      setLoading(false);
    }
  }, [open]);

  // 防抖检索
  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (!q) {
      setHits([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const timer = setTimeout(async () => {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, {
          signal: ac.signal,
        });
        const data = (await res.json()) as { hits?: SearchHit[] };
        setHits(data.hits ?? []);
        setActive(0);
      } catch (err) {
        if ((err as Error).name !== 'AbortError') setHits([]);
      } finally {
        setLoading(false);
      }
    }, 180);

    return () => clearTimeout(timer);
  }, [query, open]);

  const go = useCallback(
    (hit: SearchHit) => {
      close();
      router.push(hit.href);
    },
    [close, router],
  );

  // 按 kind 分组（保持固定顺序）
  const grouped = useMemo(() => {
    const map = new Map<SearchKind, SearchHit[]>();
    for (const k of KIND_ORDER) map.set(k, []);
    for (const h of hits) map.get(h.kind)?.push(h);
    return KIND_ORDER.map((k) => ({ kind: k, items: map.get(k) ?? [] })).filter(
      (g) => g.items.length > 0,
    );
  }, [hits]);

  const flat = useMemo(() => grouped.flatMap((g) => g.items), [grouped]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => (flat.length ? (i + 1) % flat.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (flat.length ? (i - 1 + flat.length) % flat.length : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const hit = flat[active];
      if (hit) go(hit);
    }
  };

  if (!mounted || !open) return null;

  let cursor = -1;

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-start justify-center p-4 sm:p-6">
      <div className="absolute inset-0 bg-black/40 animate-fade-in" onClick={close} aria-hidden />

      <div
        role="dialog"
        aria-modal="true"
        className="relative z-10 mt-[10vh] w-full max-w-[560px] overflow-hidden rounded-lg border border-line bg-app shadow-float animate-scale-in"
      >
        {/* 输入区 */}
        <div className="flex items-center gap-2 border-b border-line px-3">
          <Search className="h-3.5 w-3.5 shrink-0 text-ink-muted" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="搜索待办、灵感、画布、节点内容…"
            className="h-11 flex-1 bg-transparent text-[13px] text-ink placeholder:text-ink-muted focus:outline-none"
          />
          {loading && <Spinner />}
          <kbd className="hidden shrink-0 rounded-sm border border-line px-1 py-0.5 text-2xs text-ink-muted sm:block">
            Esc
          </kbd>
        </div>

        {/* 结果区 */}
        <div className="max-h-[52vh] overflow-y-auto py-1">
          {!query.trim() && (
            <div className="px-3 py-6 text-center text-xs text-ink-muted">
              输入关键词开始搜索 · 支持标题精确匹配与节点内容模糊匹配
            </div>
          )}

          {query.trim() && !loading && flat.length === 0 && (
            <div className="px-3 py-6 text-center text-xs text-ink-muted">
              没有找到「{query.trim()}」相关内容
            </div>
          )}

          {grouped.map((group) => {
            const meta = KIND_META[group.kind];
            const Icon = meta.icon;
            return (
              <div key={group.kind} className="py-1">
                <div className="flex items-center gap-1.5 px-3 py-1 text-2xs uppercase tracking-wide text-ink-muted">
                  <Icon className="h-3 w-3" />
                  {meta.label}
                  <span className="text-ink-muted/70">{group.items.length}</span>
                </div>
                {group.items.map((hit) => {
                  cursor += 1;
                  const isActive = cursor === active;
                  return (
                    <button
                      key={`${hit.kind}-${hit.id}`}
                      type="button"
                      onMouseEnter={() => setActive(cursor)}
                      onClick={() => go(hit)}
                      className={cn(
                        'flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors',
                        isActive ? 'bg-app-hover' : 'hover:bg-app-hover/60',
                      )}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] text-ink">
                          {hit.title}
                        </span>
                        {hit.snippet && (
                          <span className="mt-0.5 block truncate text-2xs text-ink-muted">
                            {hit.snippet}
                          </span>
                        )}
                      </span>
                      {isActive && (
                        <CornerDownLeft className="h-3 w-3 shrink-0 text-ink-muted" />
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* 底部提示 */}
        <div className="flex items-center justify-between border-t border-line px-3 py-1.5 text-2xs text-ink-muted">
          <span className="flex items-center gap-2">
            <span>↑↓ 选择</span>
            <span>↵ 打开</span>
          </span>
          <span>{flat.length > 0 ? `${flat.length} 条结果` : ''}</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
