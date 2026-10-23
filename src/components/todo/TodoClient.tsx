'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  CalendarDays,
  Check,
  Circle,
  CircleDot,
  ListTodo,
  Loader2,
  Plus,
  Trash2,
} from 'lucide-react';
import type { TodoItem, TodoPriority, TodoStatus } from '@/db/schema';
import { TODO_PRIORITY } from '@/db/schema';
import { api, qs } from '@/lib/api';
import { TODO_PRIORITY_LABEL, TODO_STATUS_LABEL } from '@/lib/constants';
import { formatDateTime, todayKey, weekdayLabel, fromDateKey, toDateKey } from '@/lib/date';
import { cn, truncate } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select, Textarea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { PriorityBadge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader, PageShell } from '@/components/layout/PageShell';
import { toast } from '@/components/ui/Toast';

const STATUS_ICON: Record<TodoStatus, ReactNode> = {
  pending: <Circle size={15} className="text-ink-300" />,
  doing: <CircleDot size={15} className="text-status-active" />,
  done: <Check size={15} className="text-status-done" />,
};

/**
 * 待办清单（今日 / 本周共用）
 * - 顶部快速添加，Enter 直接创建
 * - 点击圆圈切换完成状态
 * - 点击标题打开编辑弹窗
 */
export function TodoClient({ scope }: { scope: 'today' | 'week' }) {
  const params = useSearchParams();
  const [items, setItems] = useState<TodoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<TodoPriority>('medium');
  const [anchor, setAnchor] = useState(todayKey());
  const [editing, setEditing] = useState<TodoItem | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const consumed = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await api.get<TodoItem[]>(
        `/api/todo${qs({ scope, date: scope === 'week' ? anchor : undefined })}`,
      );
      setItems(rows);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [scope, anchor]);

  useEffect(() => {
    void load();
  }, [load]);

  // Ctrl+T → ?new=1 聚焦输入框；搜索跳转 → ?id= 高亮
  useEffect(() => {
    if (consumed.current) return;
    if (params.get('new') === '1') {
      consumed.current = true;
      setTimeout(() => inputRef.current?.focus(), 50);
    }
    const id = params.get('id');
    if (id) {
      consumed.current = true;
      setHighlight(id);
      setTimeout(() => setHighlight(null), 2400);
    }
  }, [params]);

  const add = async () => {
    const text = title.trim();
    if (!text) return;
    try {
      const row = await api.post<TodoItem>('/api/todo', {
        title: text,
        priority,
        planDate: scope === 'week' ? anchor : todayKey(),
      });
      setItems((prev) => [...prev, row]);
      setTitle('');
      toast.success('已添加');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '添加失败');
    }
  };

  const toggle = async (item: TodoItem) => {
    const next: TodoStatus = item.status === 'done' ? 'pending' : 'done';
    // 乐观更新
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, status: next } : i)));
    try {
      await api.patch(`/api/todo/${item.id}`, { status: next });
    } catch {
      toast.error('更新失败');
      void load();
    }
  };

  const cycleStatus = async (item: TodoItem) => {
    const next: TodoStatus =
      item.status === 'pending' ? 'doing' : item.status === 'doing' ? 'done' : 'pending';
    try {
      const row = await api.patch<TodoItem>(`/api/todo/${item.id}`, { status: next });
      setItems((prev) => prev.map((i) => (i.id === row.id ? row : i)));
    } catch {
      toast.error('更新失败');
    }
  };

  const remove = async (id: string) => {
    try {
      await api.del(`/api/todo/${id}`);
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch {
      toast.error('删除失败');
    }
  };

  const saveEdit = async () => {
    if (!editing) return;
    try {
      const row = await api.patch<TodoItem>(`/api/todo/${editing.id}`, {
        title: editing.title,
        note: editing.note,
        priority: editing.priority,
        planDate: editing.planDate,
        dueDate: editing.dueDate || null,
      });
      setItems((prev) => prev.map((i) => (i.id === row.id ? row : i)));
      setEditing(null);
      toast.success('已保存');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存失败');
    }
  };

  /* ------------------------------- 分组 ------------------------------- */
  const done = items.filter((i) => i.status === 'done').length;
  const percent = items.length ? Math.round((done / items.length) * 100) : 0;

  const groups = useMemo(() => {
    if (scope === 'today') {
      return [
        { key: 'pending', label: '待办', items: items.filter((i) => i.status !== 'done') },
        { key: 'done', label: '已完成', items: items.filter((i) => i.status === 'done') },
      ];
    }
    const map = new Map<string, TodoItem[]>();
    items.forEach((i) => {
      const list = map.get(i.planDate) ?? [];
      list.push(i);
      map.set(i.planDate, list);
    });
    return [...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, list]) => ({
        key: date,
        label: `${date} 周${weekdayLabel(fromDateKey(date))}`,
        items: list,
      }));
  }, [items, scope]);

  const weekNav = (delta: number) => {
    const d = fromDateKey(anchor);
    d.setDate(d.getDate() + delta * 7);
    setAnchor(toDateKey(d));
  };

  return (
    <PageShell>
      <PageHeader
        title={scope === 'today' ? '今日待办' : '本周任务清单'}
        desc={
          scope === 'today'
            ? `今天 ${items.length} 项任务，已完成 ${done} 项`
            : `本周共 ${items.length} 项，已完成 ${done} 项（${percent}%）`
        }
        actions={
          scope === 'week' ? (
            <div className="flex items-center gap-1">
              <Button size="sm" variant="ghost" onClick={() => weekNav(-1)}>
                上一周
              </Button>
              <span className="text-xs text-ink-500">{anchor}</span>
              <Button size="sm" variant="ghost" onClick={() => weekNav(1)}>
                下一周
              </Button>
            </div>
          ) : (
            <span className="text-xs text-ink-500">
              <kbd className="rounded border border-[var(--border-soft)] px-1">Ctrl T</kbd> 快速新建
            </span>
          )
        }
      />

      {/* 进度条 */}
      <div className="mb-4 flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-brand-50">
          <div
            className="h-full rounded-full bg-brand-400 transition-all"
            style={{ width: `${percent}%` }}
          />
        </div>
        <span className="text-[11px] tabular-nums text-ink-500">{percent}%</span>
      </div>

      {/* 快速添加 */}
      <div className="mb-4 flex items-center gap-2 rounded-card border border-[var(--border-soft)] bg-paper-card p-2 shadow-card">
        <Plus size={15} className="ml-1 text-brand-400" />
        <Input
          ref={inputRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void add();
          }}
          placeholder={
            scope === 'today' ? '添加今天要做的事，回车保存' : `添加到 ${anchor}，回车保存`
          }
          className="h-8 flex-1 border-0 shadow-none focus:shadow-none"
        />
        <Select
          value={priority}
          onChange={(e) => setPriority(e.target.value as TodoPriority)}
          className="h-8 w-20 text-[12px]"
        >
          {TODO_PRIORITY.map((p) => (
            <option key={p} value={p}>
              {TODO_PRIORITY_LABEL[p]}
            </option>
          ))}
        </Select>
        <Button size="sm" variant="primary" onClick={() => void add()} disabled={!title.trim()}>
          添加
        </Button>
      </div>

      {/* 列表 */}
      {loading && items.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-16 text-xs text-ink-500">
          <Loader2 size={14} className="animate-spin" /> 加载中…
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<ListTodo size={32} />}
          title={scope === 'today' ? '今天还没有任务' : '本周还没有安排任务'}
          desc="先加一件最想完成的小事，别一次列太多"
        />
      ) : (
        <div className="space-y-5">
          {groups.map((g) => (
            <div key={g.key}>
              <div className="mb-1.5 flex items-center gap-2">
                <h2 className="text-xs font-medium text-ink-700">{g.label}</h2>
                <span className="text-[11px] text-ink-500">{g.items.length}</span>
                <div className="h-px flex-1 bg-[var(--border-soft)]" />
              </div>

              <div className="overflow-hidden rounded-card border border-[var(--border-soft)] bg-paper-card shadow-card">
                {g.items.map((item, idx) => (
                  <div
                    key={item.id}
                    className={cn(
                      'group flex items-center gap-2.5 px-3 py-2.5 transition-colors hover:bg-brand-50/40',
                      idx > 0 && 'border-t border-[var(--border-soft)]',
                      highlight === item.id && 'bg-brand-50',
                    )}
                  >
                    <button
                      onClick={() => void toggle(item)}
                      className="shrink-0 rounded p-0.5 transition-colors hover:bg-brand-50"
                      title={item.status === 'done' ? '标记未完成' : '标记完成'}
                    >
                      {STATUS_ICON[item.status]}
                    </button>

                    <button
                      onClick={() => setEditing(item)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <p
                        className={cn(
                          'truncate text-[13px]',
                          item.status === 'done'
                            ? 'text-ink-500 line-through'
                            : 'text-ink-900',
                        )}
                      >
                        {item.title}
                      </p>
                      {(item.note || item.dueDate) && (
                        <p className="mt-0.5 truncate text-[11px] text-ink-500">
                          {item.dueDate ? `截止 ${item.dueDate}` : truncate(item.note, 60)}
                        </p>
                      )}
                    </button>

                    <button
                      onClick={() => void cycleStatus(item)}
                      className="shrink-0 rounded px-1.5 py-0.5 text-[10px] text-ink-500 transition-colors hover:bg-brand-50 hover:text-brand-600"
                      title="切换状态"
                    >
                      {TODO_STATUS_LABEL[item.status]}
                    </button>
                    <PriorityBadge priority={item.priority} />

                    {scope === 'week' && (
                      <span className="hidden shrink-0 items-center gap-1 text-[10px] text-ink-500 sm:flex">
                        <CalendarDays size={11} /> {item.planDate.slice(5)}
                      </span>
                    )}

                    <button
                      onClick={() => void remove(item.id)}
                      className="shrink-0 rounded p-1 text-ink-300 opacity-0 transition-opacity hover:text-status-abandoned group-hover:opacity-100"
                      title="删除"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 编辑弹窗 */}
      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title="编辑待办"
        size="sm"
        footer={
          <>
            <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
              取消
            </Button>
            <Button size="sm" variant="primary" onClick={() => void saveEdit()}>
              保存
            </Button>
          </>
        }
      >
        {editing && (
          <div className="space-y-3">
            <Field label="标题" required>
              <Input
                value={editing.title}
                onChange={(e) => setEditing({ ...editing, title: e.target.value })}
              />
            </Field>
            <Field label="备注">
              <Textarea
                rows={3}
                value={editing.note ?? ''}
                onChange={(e) => setEditing({ ...editing, note: e.target.value })}
              />
            </Field>
            <div className="grid grid-cols-3 gap-2">
              <Field label="计划日期">
                <Input
                  type="date"
                  value={editing.planDate}
                  onChange={(e) => setEditing({ ...editing, planDate: e.target.value })}
                />
              </Field>
              <Field label="截止日期">
                <Input
                  type="date"
                  value={editing.dueDate ?? ''}
                  onChange={(e) => setEditing({ ...editing, dueDate: e.target.value })}
                />
              </Field>
              <Field label="优先级">
                <Select
                  value={editing.priority}
                  onChange={(e) =>
                    setEditing({ ...editing, priority: e.target.value as TodoPriority })
                  }
                >
                  {TODO_PRIORITY.map((p) => (
                    <option key={p} value={p}>
                      {TODO_PRIORITY_LABEL[p]}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <p className="text-[11px] text-ink-500">
              创建于 {formatDateTime(editing.createdAt)}
            </p>
          </div>
        )}
      </Modal>
    </PageShell>
  );
}
