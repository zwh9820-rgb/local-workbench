'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Lightbulb,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Star,
} from 'lucide-react';
import type { Inspiration, InspirationStatus, InspirationType } from '@/db/schema';
import { INSPIRATION_STATUS, INSPIRATION_TYPE } from '@/db/schema';
import { api, qs } from '@/lib/api';
import {
  INSPIRATION_STATUS_LABEL,
  INSPIRATION_TYPE_LABEL,
} from '@/lib/constants';
import { relativeTime } from '@/lib/date';
import { truncate } from '@/lib/utils';
import type { InspirationCreateInput } from '@/lib/validation';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { Segmented } from '@/components/ui/Segmented';
import { ProgressBar, StatusBadge, TypeBadge } from '@/components/ui/Badge';
import { TagList } from '@/components/ui/Tag';
import { EmptyState } from '@/components/ui/EmptyState';
import { VirtualList } from '@/components/ui/VirtualList';
import { toast } from '@/components/ui/Toast';
import { InspirationForm } from './InspirationForm';

const ROW_HEIGHT = 104;

/**
 * 灵感素材库（核心页面）
 * - 关键词 / 状态 / 类型 / 标签 / 收藏 多维筛选
 * - 定高虚拟滚动，几千条素材也不卡
 * - Ctrl+N 新建（由全局快捷键跳转到 ?new=1）
 */
export function InspirationClient() {
  const router = useRouter();
  const params = useSearchParams();

  const [items, setItems] = useState<Inspiration[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [debounced, setDebounced] = useState('');
  const [status, setStatus] = useState<InspirationStatus | 'all'>('all');
  const [type, setType] = useState<InspirationType | 'all'>('all');
  const [tag, setTag] = useState<string>('');
  const [favoriteOnly, setFavoriteOnly] = useState(false);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Inspiration | null>(null);
  const [prefill, setPrefill] = useState<Partial<InspirationCreateInput> | null>(null);

  const consumed = useRef(false);

  /* ------------------------------ 数据加载 ------------------------------ */
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await api.get<Inspiration[]>(
        `/api/inspiration${qs({
          keyword: debounced,
          status: status === 'all' ? undefined : status,
          type: type === 'all' ? undefined : type,
          tag: tag || undefined,
          favorite: favoriteOnly ? 'true' : undefined,
          limit: 500,
        })}`,
      );
      setItems(rows);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [debounced, status, type, tag, favoriteOnly]);

  useEffect(() => {
    void load();
  }, [load]);

  // 关键词防抖
  useEffect(() => {
    const t = setTimeout(() => setDebounced(keyword.trim()), 250);
    return () => clearTimeout(t);
  }, [keyword]);

  /* ------------------------- URL 参数（跨页跳转） ------------------------ */
  useEffect(() => {
    if (consumed.current) return;

    if (params.get('new') === '1') {
      consumed.current = true;
      setEditing(null);
      setPrefill(null);
      setFormOpen(true);
      router.replace('/inspiration');
      return;
    }

    const id = params.get('id');
    if (id && items.length) {
      const found = items.find((i) => i.id === id);
      if (found) {
        consumed.current = true;
        setEditing(found);
        setPrefill(null);
        setFormOpen(true);
        router.replace('/inspiration');
      }
      return;
    }

    // 从剪贴板跳转：预填内容
    const clipId = params.get('clipboard');
    if (clipId) {
      consumed.current = true;
      void (async () => {
        try {
          const snaps = await api.get<Array<{ id: string; content: string }>>(
            '/api/clipboard?limit=100',
          );
          const snap = snaps.find((s) => s.id === clipId);
          setEditing(null);
          setPrefill({
            title: truncate(snap?.content ?? '剪贴板素材', 40),
            content: snap?.content ?? '',
            summary: truncate(snap?.content ?? '', 120),
            type: 'note',
            tags: ['剪贴板'],
          });
          setFormOpen(true);
        } catch {
          toast.error('读取剪贴板快照失败');
        }
        router.replace('/inspiration');
      })();
    }
  }, [params, items, router]);

  /* ------------------------------- 操作 ------------------------------- */
  const handleCreate = async (payload: InspirationCreateInput) => {
    try {
      const row = await api.post<Inspiration>('/api/inspiration', payload);
      toast.success('已保存到灵感库');
      setItems((prev) => [row, ...prev]);
      setPrefill(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存失败');
      throw err;
    }
  };

  const handleUpdate = async (payload: InspirationCreateInput) => {
    if (!editing) return;
    try {
      const row = await api.patch<Inspiration>(`/api/inspiration/${editing.id}`, payload);
      toast.success('已更新');
      setItems((prev) => prev.map((i) => (i.id === row.id ? row : i)));
      setEditing(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '更新失败');
      throw err;
    }
  };

  const handleDelete = async () => {
    if (!editing) return;
    try {
      await api.del(`/api/inspiration/${editing.id}`);
      toast.success('已删除');
      setItems((prev) => prev.filter((i) => i.id !== editing.id));
      setEditing(null);
      setFormOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '删除失败');
    }
  };

  const toggleFavorite = async (item: Inspiration) => {
    try {
      const row = await api.patch<Inspiration>(`/api/inspiration/${item.id}`, {
        isFavorite: !item.isFavorite,
      });
      setItems((prev) => prev.map((i) => (i.id === row.id ? row : i)));
    } catch {
      toast.error('操作失败');
    }
  };

  /* ------------------------------- 统计 ------------------------------- */
  const counts = useMemo(() => {
    const base = { ongoing: 0, paused: 0, finished: 0, abandoned: 0 } as Record<string, number>;
    items.forEach((i) => {
      base[i.status] = (base[i.status] ?? 0) + 1;
    });
    return base;
  }, [items]);

  const allTags = useMemo(() => {
    const set = new Map<string, number>();
    items.forEach((i) => (i.tags ?? []).forEach((t) => set.set(t, (set.get(t) ?? 0) + 1)));
    return [...set.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  }, [items]);

  return (
    <div className="flex h-full flex-col">
      {/* 头部 + 筛选 */}
      <div className="shrink-0 border-b border-[var(--border-soft)] px-5 pb-3 pt-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-ink-900">灵感素材库</h1>
            <p className="mt-1 text-xs text-ink-500">
              提示词 · ComfyUI 工作流 · 漫剧脚本 · 短视频素材，共 {items.length} 条
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={() => void load()} title="刷新">
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </Button>
            <Button
              size="sm"
              variant="primary"
              onClick={() => {
                setEditing(null);
                setPrefill(null);
                setFormOpen(true);
              }}
            >
              <Plus size={14} /> 新建灵感
              <kbd className="ml-1 rounded bg-white/15 px-1 text-[10px]">Ctrl N</kbd>
            </Button>
          </div>
        </div>

        {/* 筛选行 */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-500" />
            <Input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="搜索标题 / 正文 / 标签"
              className="h-8 w-56 pl-7 text-[13px]"
            />
          </div>

          <Segmented
            value={status}
            onChange={(v) => setStatus(v as InspirationStatus | 'all')}
            options={[
              { value: 'all', label: '全部', count: items.length },
              ...INSPIRATION_STATUS.map((s) => ({
                value: s,
                label: INSPIRATION_STATUS_LABEL[s],
                count: counts[s] ?? 0,
              })),
            ]}
          />

          <Select
            value={type}
            onChange={(e) => setType(e.target.value as InspirationType | 'all')}
            className="h-8 w-28 text-[13px]"
          >
            <option value="all">全部类型</option>
            {INSPIRATION_TYPE.map((t) => (
              <option key={t} value={t}>
                {INSPIRATION_TYPE_LABEL[t]}
              </option>
            ))}
          </Select>

          <Button
            size="sm"
            variant={favoriteOnly ? 'subtle' : 'ghost'}
            onClick={() => setFavoriteOnly((v) => !v)}
          >
            <Star size={13} className={favoriteOnly ? 'fill-current' : ''} /> 收藏
          </Button>
        </div>

        {/* 标签云 */}
        {allTags.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1">
            <span className="text-[11px] text-ink-500">标签</span>
            {allTags.map(([t, n]) => (
              <TagList
                key={t}
                tags={[`${t} ·${n}`]}
                activeTag={tag === t ? `${t} ·${n}` : undefined}
                onClick={() => setTag((prev) => (prev === t ? '' : t))}
              />
            ))}
          </div>
        )}
      </div>

      {/* 列表（虚拟滚动） */}
      <div className="min-h-0 flex-1 px-5 py-3">
        {loading && items.length === 0 ? (
          <div className="flex h-full items-center justify-center gap-2 text-xs text-ink-500">
            <Loader2 size={14} className="animate-spin" /> 加载中…
          </div>
        ) : (
          <VirtualList
            items={items}
            itemHeight={ROW_HEIGHT}
            className="h-full pr-1"
            empty={
              <EmptyState
                icon={<Lightbulb size={32} />}
                title="还没有灵感素材"
                desc="按 Ctrl+N 新建第一条，或从剪贴板快照一键导入"
                action={
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => {
                      setEditing(null);
                      setPrefill(null);
                      setFormOpen(true);
                    }}
                  >
                    <Plus size={14} /> 新建灵感
                  </Button>
                }
              />
            }
            renderItem={(item) => (
              <div className="pb-2">
                <button
                  onClick={() => {
                    setEditing(item);
                    setPrefill(null);
                    setFormOpen(true);
                  }}
                  className="group flex h-[96px] w-full items-stretch gap-3 rounded-card border border-[var(--border-soft)] bg-paper-card px-4 py-2.5 text-left shadow-card transition-colors hover:border-brand-200 hover:bg-brand-50/30"
                >
                  <div className="flex min-w-0 flex-1 flex-col justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="truncate text-[13.5px] font-medium text-ink-900">
                          {item.title}
                        </h3>
                        <StatusBadge status={item.status} />
                        <TypeBadge type={item.type} />
                      </div>
                      <p className="mt-1 line-clamp-2 text-[12px] leading-5 text-ink-500">
                        {truncate(item.summary || item.content, 150) || '暂无摘要'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <TagList tags={item.tags} max={3} />
                      {item.localPath && (
                        <span className="truncate font-mono text-[10px] text-ink-500/80">
                          {item.localPath}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex w-[132px] shrink-0 flex-col items-end justify-between">
                    <span className="text-[10px] text-ink-500">
                      {relativeTime(item.updatedAt)}
                    </span>
                    <div className="w-full">
                      <ProgressBar value={item.progress} showLabel />
                    </div>
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation();
                        void toggleFavorite(item);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.stopPropagation();
                          void toggleFavorite(item);
                        }
                      }}
                      className="rounded p-0.5 text-ink-300 transition-colors hover:text-status-paused"
                      title={item.isFavorite ? '取消收藏' : '收藏'}
                    >
                      <Star
                        size={13}
                        className={item.isFavorite ? 'fill-status-paused text-status-paused' : ''}
                      />
                    </span>
                  </div>
                </button>
              </div>
            )}
          />
        )}
      </div>

      <InspirationForm
        open={formOpen}
        initial={editing}
        defaults={prefill}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
          setPrefill(null);
        }}
        onSubmit={editing ? handleUpdate : handleCreate}
        onDelete={editing ? handleDelete : undefined}
      />
    </div>
  );
}
