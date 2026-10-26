'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Frame, LayoutTemplate, Plus, Trash2 } from 'lucide-react';
import type { CanvasListItem } from '@/db/schema';
import { createCanvas, deleteCanvas } from '@/server/actions/canvas';
import { PageScroll } from '@/components/layout/page-container';
import { CanvasCard } from '@/components/canvas/canvas-card';
import { Button } from '@/components/ui/button';
import { ConfirmDialog, Dialog } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { Card, EmptyState, PageHeader } from '@/components/ui/card';
import { Chip } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

type Tab = 'all' | 'mine' | 'template';

export function CanvasGrid({
  initialItems,
  autoOpenCreate = false,
}: {
  initialItems: CanvasListItem[];
  autoOpenCreate?: boolean;
}) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [tab, setTab] = useState<Tab>('all');
  const [creating, setCreating] = useState(autoOpenCreate);
  const [deleteTarget, setDeleteTarget] = useState<CanvasListItem | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => setItems(initialItems), [initialItems]);

  const filtered = useMemo(() => {
    if (tab === 'mine') return items.filter((c) => !c.isTemplate);
    if (tab === 'template') return items.filter((c) => c.isTemplate);
    return items;
  }, [items, tab]);

  const templates = useMemo(() => items.filter((c) => c.isTemplate), [items]);

  const onDelete = async () => {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    setItems((prev) => prev.filter((c) => c.id !== id));
    setDeleteTarget(null);
    startTransition(async () => {
      await deleteCanvas(id);
      router.refresh();
    });
  };

  return (
    <PageScroll maxWidth="max-w-[1180px]">
      <PageHeader
        title="画布"
        description={`${items.filter((c) => !c.isTemplate).length} 个项目 · ${templates.length} 个模板`}
        actions={
          <Button
            variant="primary"
            size="sm"
            icon={<Plus />}
            onClick={() => setCreating(true)}
          >
            新建画布
          </Button>
        }
      />

      <div className="mt-3 flex items-center gap-1">
        <Chip active={tab === 'all'} onClick={() => setTab('all')}>
          全部
        </Chip>
        <Chip active={tab === 'mine'} onClick={() => setTab('mine')}>
          我的项目
        </Chip>
        <Chip active={tab === 'template'} onClick={() => setTab('template')}>
          模板
        </Chip>
      </div>

      {filtered.length === 0 ? (
        <Card className="mt-3">
          <EmptyState
            icon={<Frame />}
            title={tab === 'template' ? '还没有模板' : '还没有画布'}
            description="一张画布就是一个项目。把提示词、ComfyUI 工作流、生成结果都摊在上面，随时拖拽重排。"
            action={
              <Button variant="ghost" size="sm" icon={<Plus />} onClick={() => setCreating(true)}>
                新建画布
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {filtered.map((c) => (
            <div key={c.id} className="group relative">
              <CanvasCard canvas={c} />
              <button
                type="button"
                onClick={() => setDeleteTarget(c)}
                aria-label="删除画布"
                className={cn(
                  'absolute right-1.5 top-1.5 z-10 rounded-sm border border-line bg-app/90 p-1 text-ink-muted',
                  'opacity-0 transition-all hover:text-[var(--error)] group-hover:opacity-100',
                )}
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <CreateCanvasDialog
        open={creating}
        templates={templates}
        onClose={() => setCreating(false)}
        onCreated={(id) => router.push(`/canvas/${id}`)}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={onDelete}
        title="删除画布"
        message={`确定删除「${deleteTarget?.name ?? ''}」？画布内所有节点与连线会一并删除，且不可撤销。`}
        confirmText="删除"
        danger
      />
    </PageScroll>
  );
}

/* ------------------------------ 新建画布弹窗 ----------------------------- */

function CreateCanvasDialog({
  open,
  templates,
  onClose,
  onCreated,
}: {
  open: boolean;
  templates: CanvasListItem[];
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [fromCanvasId, setFromCanvasId] = useState('');
  const [isTemplate, setIsTemplate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName('');
    setDescription('');
    setFromCanvasId('');
    setIsTemplate(false);
    setError(null);
    setSaving(false);
  }, [open]);

  const submit = async () => {
    if (!name.trim()) {
      setError('请填写画布名称');
      return;
    }
    setSaving(true);
    try {
      const row = await createCanvas({
        name,
        description: description || null,
        isTemplate,
        fromCanvasId: fromCanvasId || null,
      });
      onCreated(row.id);
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
      title="新建画布"
      description="一张画布 = 一个项目"
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
        <Field label="名称" required error={error ?? undefined}>
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例如：赛博城市短片"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) submit();
            }}
          />
        </Field>

        <Field label="描述">
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="这个项目要做什么（可选）"
            rows={2}
          />
        </Field>

        {templates.length > 0 && (
          <Field label="从模板复制" hint="复制模板的节点与连线布局">
            <Select
              value={fromCanvasId}
              onChange={(e) => setFromCanvasId(e.target.value)}
            >
              <option value="">空白画布</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </Field>
        )}

        <label className="flex cursor-pointer items-center gap-2 text-xs text-ink-secondary">
          <input
            type="checkbox"
            checked={isTemplate}
            onChange={(e) => setIsTemplate(e.target.checked)}
            className="h-3.5 w-3.5 accent-[var(--text-primary)]"
          />
          <LayoutTemplate className="h-3.5 w-3.5" />
          保存为模板（后续可被复制）
        </label>
      </div>
    </Dialog>
  );
}
