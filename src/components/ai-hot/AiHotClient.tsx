'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  ExternalLink,
  Flame,
  Loader2,
  Plus,
  Search,
  Star,
  Trash2,
} from 'lucide-react';
import type { AiHot } from '@/db/schema';
import { api, qs } from '@/lib/api';
import { relativeTime } from '@/lib/date';
import { truncate } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Field, Input, Textarea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { TagList } from '@/components/ui/Tag';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader, PageShell } from '@/components/layout/PageShell';
import { toast } from '@/components/ui/Toast';
import { MarkdownEditor } from '@/components/editor/MarkdownEditor';

type Draft = {
  id?: string;
  title: string;
  summary: string;
  content: string;
  source: string;
  sourceUrl: string;
  category: string;
  heat: number;
  tagsText: string;
};

const empty = (): Draft => ({
  title: '',
  summary: '',
  content: '',
  source: '',
  sourceUrl: '',
  category: '',
  heat: 60,
  tagsText: '',
});

/** AI 热点记录 */
export function AiHotClient() {
  const [items, setItems] = useState<AiHot[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await api.get<AiHot[]>(`/api/ai-hot${qs({ keyword, limit: 200 })}`);
      setItems(rows);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [keyword]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 250);
    return () => clearTimeout(t);
  }, [load]);

  const openEdit = (item: AiHot) => {
    setDraft({
      id: item.id,
      title: item.title,
      summary: item.summary ?? '',
      content: item.content ?? '',
      source: item.source ?? '',
      sourceUrl: item.sourceUrl ?? '',
      category: item.category ?? '',
      heat: item.heat,
      tagsText: (item.tags ?? []).join(', '),
    });
  };

  const save = async () => {
    if (!draft || !draft.title.trim()) {
      toast.error('请填写标题');
      return;
    }
    const payload = {
      title: draft.title.trim(),
      summary: draft.summary.trim() || null,
      content: draft.content,
      source: draft.source.trim() || null,
      sourceUrl: draft.sourceUrl.trim() || null,
      category: draft.category.trim() || null,
      heat: Number(draft.heat) || 0,
      tags: draft.tagsText
        .split(/[,，\s]+/)
        .map((t) => t.trim())
        .filter(Boolean),
    };
    try {
      if (draft.id) {
        await api.patch(`/api/ai-hot/${draft.id}`, payload);
        toast.success('已更新');
      } else {
        await api.post('/api/ai-hot', payload);
        toast.success('已记录');
      }
      setDraft(null);
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存失败');
    }
  };

  const star = async (item: AiHot) => {
    try {
      const row = await api.patch<AiHot>(`/api/ai-hot/${item.id}`, {
        isStarred: !item.isStarred,
      });
      setItems((prev) => prev.map((i) => (i.id === row.id ? row : i)));
    } catch {
      toast.error('操作失败');
    }
  };

  const remove = async (id: string) => {
    try {
      await api.del(`/api/ai-hot/${id}`);
      setItems((prev) => prev.filter((i) => i.id !== id));
      toast.success('已删除');
    } catch {
      toast.error('删除失败');
    }
  };

  return (
    <PageShell>
      <PageHeader
        title="AI 热点笔记"
        desc="记录值得跟进的模型、工具、平台变化"
        actions={
          <>
            <div className="relative">
              <Search
                size={13}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-500"
              />
              <Input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="搜索热点"
                className="h-8 w-48 pl-7 text-[13px]"
              />
            </div>
            <Button size="sm" variant="primary" onClick={() => setDraft(empty())}>
              <Plus size={14} /> 记录热点
            </Button>
          </>
        }
      />

      {loading && items.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-16 text-xs text-ink-500">
          <Loader2 size={14} className="animate-spin" /> 加载中…
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Flame size={32} />}
          title="还没有热点记录"
          desc="看到值得跟进的消息，先记下来再慢慢消化"
          action={
            <Button size="sm" variant="primary" onClick={() => setDraft(empty())}>
              <Plus size={14} /> 记录第一条
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {items.map((item) => (
            <div
              key={item.id}
              className="group wb-card flex flex-col px-4 py-3 transition-colors hover:border-brand-200"
            >
              <div className="flex items-start gap-2">
                <button onClick={() => openEdit(item)} className="min-w-0 flex-1 text-left">
                  <h3 className="line-clamp-1 text-[13.5px] font-medium text-ink-900">
                    {item.title}
                  </h3>
                  <p className="mt-1 line-clamp-2 text-[12px] leading-5 text-ink-500">
                    {truncate(item.summary || item.content, 140) || '暂无摘要'}
                  </p>
                </button>
                <button
                  onClick={() => void star(item)}
                  className="shrink-0 rounded p-1 text-ink-300 transition-colors hover:text-status-paused"
                >
                  <Star
                    size={13}
                    className={item.isStarred ? 'fill-status-paused text-status-paused' : ''}
                  />
                </button>
              </div>

              <div className="mt-2 flex items-center gap-2">
                <TagList tags={item.tags} max={3} />
                <span className="ml-auto flex items-center gap-1 text-[10px] text-status-paused">
                  <Flame size={10} /> {item.heat}
                </span>
              </div>

              <div className="mt-2 flex items-center gap-2 border-t border-[var(--border-soft)] pt-2 text-[10px] text-ink-500">
                <span>{item.source ?? '未标注来源'}</span>
                <span>· {relativeTime(item.createdAt)}</span>
                {item.sourceUrl && (
                  <a
                    href={item.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-0.5 text-brand-400 hover:text-brand-500"
                  >
                    <ExternalLink size={10} /> 原文
                  </a>
                )}
                <button
                  onClick={() => void remove(item.id)}
                  className="ml-auto rounded p-0.5 opacity-0 transition-opacity hover:text-status-abandoned group-hover:opacity-100"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={Boolean(draft)}
        onClose={() => setDraft(null)}
        title={draft?.id ? '编辑热点' : '记录热点'}
        size="lg"
        bodyClassName="max-h-[72vh] overflow-y-auto"
        footer={
          <>
            <Button size="sm" variant="ghost" onClick={() => setDraft(null)}>
              取消
            </Button>
            <Button size="sm" variant="primary" onClick={() => void save()}>
              保存
            </Button>
          </>
        }
      >
        {draft && (
          <div className="space-y-3">
            <Field label="标题" required>
              <Input
                value={draft.title}
                autoFocus
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              />
            </Field>
            <Field label="一句话摘要">
              <Textarea
                rows={2}
                value={draft.summary}
                onChange={(e) => setDraft({ ...draft, summary: e.target.value })}
              />
            </Field>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Field label="来源">
                <Input
                  value={draft.source}
                  onChange={(e) => setDraft({ ...draft, source: e.target.value })}
                  placeholder="官方公告"
                />
              </Field>
              <Field label="分类">
                <Input
                  value={draft.category}
                  onChange={(e) => setDraft({ ...draft, category: e.target.value })}
                  placeholder="模型 / 工具"
                />
              </Field>
              <Field label="热度">
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={draft.heat}
                  onChange={(e) => setDraft({ ...draft, heat: Number(e.target.value) })}
                />
              </Field>
              <Field label="标签">
                <Input
                  value={draft.tagsText}
                  onChange={(e) => setDraft({ ...draft, tagsText: e.target.value })}
                  placeholder="deepseek, agent"
                />
              </Field>
            </div>
            <Field label="原文链接">
              <Input
                value={draft.sourceUrl}
                onChange={(e) => setDraft({ ...draft, sourceUrl: e.target.value })}
                placeholder="https://"
                className="font-mono text-[12px]"
              />
            </Field>
            <Field label="笔记正文（Markdown）">
              <MarkdownEditor
                value={draft.content}
                onChange={(v) => setDraft({ ...draft, content: v })}
                height={240}
              />
            </Field>
          </div>
        )}
      </Modal>
    </PageShell>
  );
}
