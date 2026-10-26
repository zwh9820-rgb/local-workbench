'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, CheckSquare, Plus, Trash2 } from 'lucide-react';
import type { TodoItem } from '@/db/schema';
import { createTodo, deleteTodo, toggleTodo } from '@/server/actions/todo';
import { PageScroll } from '@/components/layout/page-container';
import { Button } from '@/components/ui/button';
import { Dialog, ConfirmDialog } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { Card, EmptyState, PageHeader } from '@/components/ui/card';
import { Chip } from '@/components/ui/badge';
import { TODO_PRIORITY_LABEL } from '@/lib/constants';
import { cn, dateKey, dayRange, formatDateTime, parseTags, weekRange } from '@/lib/utils';

type View = 'today' | 'week' | 'all';

const VIEWS: Array<{ key: View; label: string }> = [
  { key: 'today', label: '今日' },
  { key: 'week', label: '本周' },
  { key: 'all', label: '全部' },
];

const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 } as const;

export function TodoBoard({
  initialItems,
  autoOpenCreate = false,
}: {
  initialItems: TodoItem[];
  autoOpenCreate?: boolean;
}) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [view, setView] = useState<View>('today');
  const [createOpen, setCreateOpen] = useState(autoOpenCreate);
  const [deleteTarget, setDeleteTarget] = useState<TodoItem | null>(null);
  const [pending, startTransition] = useTransition();

  // 服务端刷新后同步（例如从 Agent 那边改了数据）
  useEffect(() => setItems(initialItems), [initialItems]);

  /* ------------------------------ 视图筛选 ------------------------------ */
  const filtered = useMemo(() => {
    const now = new Date();
    const { start: dayStart, end: dayEnd } = dayRange(now);
    const { start: weekStart, end: weekEnd } = weekRange(now);

    const inRange = (d: Date | null, start: Date, end: Date) =>
      d ? d >= start && d <= end : false;

    let list = items;
    if (view === 'today') {
      list = items.filter(
        (t) =>
          inRange(t.dueDate, dayStart, dayEnd) ||
          (!t.dueDate && inRange(t.createdAt, dayStart, dayEnd)),
      );
    } else if (view === 'week') {
      list = items.filter(
        (t) =>
          inRange(t.dueDate, weekStart, weekEnd) ||
          (!t.dueDate && inRange(t.createdAt, weekStart, weekEnd)),
      );
    }

    // 未完成优先 → 优先级 → 截止时间
    return [...list].sort((a, b) => {
      if (a.status !== b.status) return a.status === 'done' ? 1 : -1;
      const pa = PRIORITY_ORDER[a.priority];
      const pb = PRIORITY_ORDER[b.priority];
      if (pa !== pb) return pa - pb;
      const ta = a.dueDate?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const tb = b.dueDate?.getTime() ?? Number.MAX_SAFE_INTEGER;
      return ta - tb;
    });
  }, [items, view]);

  const counts = useMemo(() => {
    const pendingCount = filtered.filter((t) => t.status === 'pending').length;
    return { total: filtered.length, pending: pendingCount };
  }, [filtered]);

  /* ------------------------------- 操作 -------------------------------- */
  const onToggle = (item: TodoItem) => {
    // 乐观更新
    setItems((prev) =>
      prev.map((t) =>
        t.id === item.id
          ? { ...t, status: t.status === 'done' ? 'pending' : 'done' }
          : t,
      ),
    );
    startTransition(async () => {
      try {
        await toggleTodo(item.id);
        router.refresh();
      } catch {
        setItems(initialItems);
      }
    });
  };

  const onDelete = async () => {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    setItems((prev) => prev.filter((t) => t.id !== id));
    setDeleteTarget(null);
    startTransition(async () => {
      await deleteTodo(id);
      router.refresh();
    });
  };

  return (
    <PageScroll maxWidth="max-w-[860px]">
      <PageHeader
        title="待办"
        description={`${counts.pending} 项待完成 · 共 ${counts.total} 项`}
        actions={
          <Button
            variant="primary"
            size="sm"
            icon={<Plus />}
            onClick={() => setCreateOpen(true)}
          >
            新建
          </Button>
        }
      />

      {/* 视图切换 */}
      <div className="mt-3 flex items-center gap-1">
        {VIEWS.map((v) => (
          <Chip key={v.key} active={view === v.key} onClick={() => setView(v.key)}>
            {v.label}
          </Chip>
        ))}
      </div>

      {/* 列表 */}
      <Card className="mt-3 overflow-hidden">
        {filtered.length === 0 ? (
          <EmptyState
            icon={<CheckSquare />}
            title={view === 'today' ? '今天没有待办' : '这里还没有任务'}
            description="按 Ctrl+T 可随时新建待办。"
            action={
              <Button variant="ghost" size="sm" icon={<Plus />} onClick={() => setCreateOpen(true)}>
                新建待办
              </Button>
            }
          />
        ) : (
          <ul className="divide-y divide-line">
            {filtered.map((item) => (
              <li
                key={item.id}
                className="group flex items-start gap-2.5 px-3 py-2 transition-colors hover:bg-app-hover"
              >
                {/* 勾选 */}
                <button
                  type="button"
                  onClick={() => onToggle(item)}
                  disabled={pending}
                  aria-label={item.status === 'done' ? '标记未完成' : '标记完成'}
                  className={cn(
                    'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border transition-colors',
                    item.status === 'done'
                      ? 'border-line-strong bg-app-inverse text-ink-inverse'
                      : 'border-line-strong text-transparent hover:border-ink',
                  )}
                >
                  <Check className="h-3 w-3" strokeWidth={2.5} />
                </button>

                {/* 内容 */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={cn(
                        'truncate text-[13px]',
                        item.status === 'done'
                          ? 'text-ink-muted line-through'
                          : 'text-ink',
                      )}
                    >
                      {item.title}
                    </span>
                    {item.priority === 'high' && item.status === 'pending' && (
                      <span className="shrink-0 rounded-sm border border-line px-1 text-[10px] text-ink-secondary">
                        高
                      </span>
                    )}
                  </div>

                  {item.description && (
                    <p className="mt-0.5 line-clamp-2 text-2xs leading-5 text-ink-muted">
                      {item.description}
                    </p>
                  )}

                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-2xs text-ink-muted">
                    {item.dueDate && (
                      <span
                        className={cn(
                          item.status === 'pending' &&
                            item.dueDate < new Date() &&
                            'text-[var(--error)]',
                        )}
                      >
                        截止 {formatDateTime(item.dueDate)}
                      </span>
                    )}
                    <span className="text-ink-muted/70">
                      {TODO_PRIORITY_LABEL[item.priority]}优先级
                    </span>
                    {item.tags.map((t) => (
                      <Chip key={t}>{t}</Chip>
                    ))}
                  </div>
                </div>

                {/* 删除 */}
                <button
                  type="button"
                  onClick={() => setDeleteTarget(item)}
                  aria-label="删除"
                  className="mt-0.5 shrink-0 rounded-sm p-1 text-ink-muted opacity-0 transition-all hover:text-[var(--error)] group-hover:opacity-100"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <CreateTodoDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(row) => {
          setItems((prev) => [row, ...prev]);
          setView('today');
          router.refresh();
        }}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={onDelete}
        title="删除待办"
        message={`确定删除「${deleteTarget?.title ?? ''}」？该操作不可撤销。`}
        confirmText="删除"
        danger
      />
    </PageScroll>
  );
}

/* ------------------------------ 新建待办弹窗 ------------------------------ */

function CreateTodoDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (row: TodoItem) => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [dueDate, setDueDate] = useState(dateKey());
  const [tagsInput, setTagsInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // 关闭后重置
  useEffect(() => {
    if (!open) {
      setTitle('');
      setDescription('');
      setPriority('medium');
      setDueDate(dateKey());
      setTagsInput('');
      setError(null);
      setSaving(false);
    }
  }, [open]);

  const submit = async () => {
    if (!title.trim()) {
      setError('请填写标题');
      return;
    }
    setSaving(true);
    try {
      const row = await createTodo({
        title,
        description: description || undefined,
        priority,
        dueDate: dueDate || null,
        tags: parseTags(tagsInput),
      });
      onCreated(row);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : '创建失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="新建待办"
      size="md"
      closeOnBackdrop={!saving}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>
            取消
          </Button>
          <Button variant="primary" size="sm" onClick={submit} loading={saving}>
            创建
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="标题" required error={error ?? undefined}>
          <Input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="要做什么？"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) submit();
            }}
          />
        </Field>

        <Field label="描述">
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="补充说明（可选）"
            rows={3}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="优先级">
            <Select
              value={priority}
              onChange={(e) => setPriority(e.target.value as typeof priority)}
            >
              <option value="high">高</option>
              <option value="medium">中</option>
              <option value="low">低</option>
            </Select>
          </Field>
          <Field label="截止日期">
            <Input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </Field>
        </div>

        <Field label="标签" hint="用逗号或空格分隔">
          <Input
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
            placeholder="例如：画布, 提示词"
          />
        </Field>
      </div>
    </Dialog>
  );
}
