'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Lightbulb, Pin, Plus, Search, Trash2 } from 'lucide-react';
import type { Inspiration } from '@/db/schema';
import {
  createInspiration,
  deleteInspiration,
  updateInspiration,
} from '@/server/actions/inspiration';
import { PageScroll } from '@/components/layout/page-container';
import { Button } from '@/components/ui/button';
import { ConfirmDialog, Dialog } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { Card, EmptyState, PageHeader } from '@/components/ui/card';
import { Chip, ProgressBar, StatusBadge, Tag } from '@/components/ui/badge';
import { MarkdownEditor } from '@/components/markdown/markdown-editor';
import { INSPIRATION_STATUS_LABEL, INSPIRATION_TYPE_LABEL } from '@/lib/constants';
import { cn, parseTags, stripMarkdown, timeAgo, truncate } from '@/lib/utils';

type StatusFilter = 'all' | Inspiration['status'];

const STATUS_TABS: Array<{ key: StatusFilter; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'ongoing', label: '进行中' },
  { key: 'paused', label: '搁置' },
  { key: 'finished', label: '已完成' },
  { key: 'abandoned', label: '已放弃' },
];

const STATUS_TONE = {
  ongoing: 'warning',
  paused: 'idle',
  finished: 'success',
  abandoned: 'error',
} as const;

export function InspirationBoard({
  initialItems,
  autoOpenCreate = false,
  focusId,
}: {
  initialItems: Inspiration[];
  autoOpenCreate?: boolean;
  focusId?: string;
}) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [status, setStatus] = useState<StatusFilter>('all');
  const [type, setType] = useState<'all' | Inspiration['type']>('all');
  const [keyword, setKeyword] = useState('');
  const [editing, setEditing] = useState<Inspiration | null>(null);
  const [creating, setCreating] = useState(autoOpenCreate);
  const [deleteTarget, setDeleteTarget] = useState<Inspiration | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => setItems(initialItems), [initialItems]);

  // 从全局搜索跳转过来：自动打开对应条目
  useEffect(() => {
    if (!focusId) return;
    const hit = initialItems.find((i) => i.id === focusId);
    if (hit) setEditing(hit);
  }, [focusId, initialItems]);

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return items.filter((i) => {
      if (status !== 'all' && i.status !== status) return false;
      if (type !== 'all' && i.type !== type) return false;
      if (!kw) return true;
      return (
        i.title.toLowerCase().includes(kw) ||
        i.content.toLowerCase().includes(kw) ||
        i.tags.some((t) => t.toLowerCase().includes(kw))
      );
    });
  }, [items, status, type, keyword]);

  const onDelete = async () => {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    setItems((prev) => prev.filter((i) => i.id !== id));
    setDeleteTarget(null);
    startTransition(async () => {
      await deleteInspiration(id);
      router.refresh();
    });
  };

  return (
    <PageScroll>
      <PageHeader
        title="灵感"
        description={`${items.length} 条素材 · 碎片、半成品、提示词、脚本都放这里`}
        actions={
          <Button
            variant="primary"
            size="sm"
            icon={<Plus />}
            onClick={() => setCreating(true)}
          >
            新建
          </Button>
        }
      />

      {/* 筛选栏 */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          {STATUS_TABS.map((t) => (
            <Chip key={t.key} active={status === t.key} onClick={() => setStatus(t.key)}>
              {t.label}
            </Chip>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <Select
            value={type}
            onChange={(e) => setType(e.target.value as typeof type)}
            className="h-7 w-[104px] text-xs"
          >
            <option value="all">全部类型</option>
            {Object.entries(INSPIRATION_TYPE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>

          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-muted" />
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="筛选…"
              className="h-7 w-[160px] rounded-md border border-line bg-app pl-7 pr-2 text-xs text-ink placeholder:text-ink-muted focus:border-line-strong focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* 列表 */}
      {filtered.length === 0 ? (
        <Card className="mt-3">
          <EmptyState
            icon={<Lightbulb />}
            title={items.length === 0 ? '还没有灵感' : '没有符合条件的条目'}
            description={
              items.length === 0
                ? '记录碎片化想法、半成品项目、提示词片段。按 Ctrl+N 随时新建。'
                : '试试切换状态筛选或清空关键词。'
            }
            action={
              items.length === 0 ? (
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<Plus />}
                  onClick={() => setCreating(true)}
                >
                  新建灵感
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((item) => (
            <Card
              key={item.id}
              hoverable
              onClick={() => setEditing(item)}
              className="group flex flex-col p-3"
            >
              <div className="flex items-start gap-1.5">
                <h3 className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">
                  {item.title}
                </h3>
                {item.pinned && <Pin className="h-3 w-3 shrink-0 text-ink-secondary" />}
                <StatusBadge
                  tone={STATUS_TONE[item.status]}
                  label={INSPIRATION_STATUS_LABEL[item.status]}
                />
              </div>

              <p className="mt-1.5 line-clamp-3 min-h-[48px] text-2xs leading-5 text-ink-muted">
                {truncate(stripMarkdown(item.content), 120) || '（空内容）'}
              </p>

              {item.progress > 0 && (
                <div className="mt-2 flex items-center gap-2">
                  <ProgressBar value={item.progress} tone="idle" className="flex-1" />
                  <span className="w-7 shrink-0 text-right text-2xs text-ink-muted">
                    {item.progress}%
                  </span>
                </div>
              )}

              <div className="mt-2 flex flex-wrap items-center gap-1">
                <span className="rounded-sm border border-line px-1 text-[10px] text-ink-muted">
                  {INSPIRATION_TYPE_LABEL[item.type]}
                </span>
                {item.tags.slice(0, 3).map((t) => (
                  <Tag key={t}>{t}</Tag>
                ))}
                <span className="ml-auto text-2xs text-ink-muted">
                  {timeAgo(item.updatedAt)}
                </span>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* 编辑 / 新建 */}
      <InspirationEditor
        open={Boolean(editing) || creating}
        item={editing}
        onClose={() => {
          setEditing(null);
          setCreating(false);
        }}
        onSaved={(row, isNew) => {
          setItems((prev) =>
            isNew ? [row, ...prev] : prev.map((i) => (i.id === row.id ? row : i)),
          );
          router.refresh();
        }}
        onDeleteRequest={(item) => {
          setEditing(null);
          setDeleteTarget(item);
        }}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={onDelete}
        title="删除灵感"
        message={`确定删除「${deleteTarget?.title ?? ''}」？该操作不可撤销。`}
        confirmText="删除"
        danger
      />
    </PageScroll>
  );
}

/* ------------------------------ 编辑弹窗 -------------------------------- */

function InspirationEditor({
  open,
  item,
  onClose,
  onSaved,
  onDeleteRequest,
}: {
  open: boolean;
  item: Inspiration | null;
  onClose: () => void;
  onSaved: (row: Inspiration, isNew: boolean) => void;
  onDeleteRequest: (item: Inspiration) => void;
}) {
  const isNew = !item;
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [type, setType] = useState<Inspiration['type']>('idea');
  const [status, setStatus] = useState<Inspiration['status']>('ongoing');
  const [progress, setProgress] = useState(0);
  const [tagsInput, setTagsInput] = useState('');
  const [source, setSource] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 打开时回填
  useEffect(() => {
    if (!open) return;
    setTitle(item?.title ?? '');
    setContent(item?.content ?? '');
    setType(item?.type ?? 'idea');
    setStatus(item?.status ?? 'ongoing');
    setProgress(item?.progress ?? 0);
    setTagsInput(item?.tags.join(', ') ?? '');
    setSource(item?.source ?? '');
    setError(null);
  }, [open, item]);

  const save = async () => {
    if (!title.trim()) {
      setError('请填写标题');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title,
        content,
        type,
        status,
        progress,
        tags: parseTags(tagsInput),
        source: source || null,
      };
      const row = item
        ? await updateInspiration(item.id, payload)
        : await createInspiration(payload);
      onSaved(row, !item);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={isNew ? '新建灵感' : '编辑灵感'}
      size="xl"
      closeOnBackdrop={false}
      footer={
        <div className="flex w-full items-center justify-between">
          <div>
            {!isNew && item && (
              <Button
                variant="danger"
                size="sm"
                icon={<Trash2 />}
                onClick={() => onDeleteRequest(item)}
              >
                删除
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>
              取消
            </Button>
            <Button variant="primary" size="sm" onClick={save} loading={saving}>
              保存
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-3">
        <Field label="标题" required error={error ?? undefined}>
          <Input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="一句话概括这个想法"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="类型">
            <Select value={type} onChange={(e) => setType(e.target.value as typeof type)}>
              {Object.entries(INSPIRATION_TYPE_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="状态">
            <Select
              value={status}
              onChange={(e) => setStatus(e.target.value as typeof status)}
            >
              {Object.entries(INSPIRATION_STATUS_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={`进度 ${progress}%`}>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={progress}
              onChange={(e) => setProgress(Number(e.target.value))}
              className={cn('mt-2 w-full accent-[var(--text-primary)]')}
            />
          </Field>
          <Field label="来源">
            <Input
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder="网址 / 书 / 对话"
            />
          </Field>
        </div>

        <Field label="标签" hint="逗号或空格分隔">
          <Input
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
            placeholder="例如：短片, 赛博, 提示词"
          />
        </Field>

        <Field label="内容（Markdown）">
          <MarkdownEditor value={content} onChange={setContent} height={320} />
        </Field>

        {!isNew && item && (
          <p className="text-2xs text-ink-muted">
            创建于 {timeAgo(item.createdAt)} · 最近更新 {timeAgo(item.updatedAt)}
          </p>
        )}
      </div>
    </Dialog>
  );
}
