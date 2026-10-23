'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Braces,
  Copy,
  Loader2,
  Plus,
  Save,
  Search,
  Trash2,
  Wand2,
} from 'lucide-react';
import type { PromptTemplate } from '@/db/schema';
import { api, qs } from '@/lib/api';
import { copyText, extractVariables, renderTemplate, truncate } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Field, Input, Textarea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { TagList } from '@/components/ui/Tag';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader, PageShell } from '@/components/layout/PageShell';
import { MarkdownEditor } from '@/components/editor/MarkdownEditor';
import { toast } from '@/components/ui/Toast';

type Draft = {
  id?: string;
  name: string;
  description: string;
  content: string;
  category: string;
  model: string;
  tagsText: string;
};

const emptyDraft = (): Draft => ({
  name: '',
  description: '',
  content: '',
  category: '',
  model: 'deepseek',
  tagsText: '',
});

/** 提示词模板库：{{变量}} 一键填充 */
export function PromptTemplateClient() {
  const params = useSearchParams();
  const [items, setItems] = useState<PromptTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [activeId, setActiveId] = useState<string | null>(params.get('id'));
  const [values, setValues] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState<Draft | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await api.get<PromptTemplate[]>(
        `/api/prompt-template${qs({ keyword })}`,
      );
      setItems(rows);
      setActiveId((prev) => prev ?? rows[0]?.id ?? null);
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

  const active = useMemo(
    () => items.find((i) => i.id === activeId) ?? items[0] ?? null,
    [items, activeId],
  );

  // 切换模板时重置变量值
  useEffect(() => {
    if (!active) return;
    const vars = active.variables?.length
      ? active.variables
      : extractVariables(active.content);
    const next: Record<string, string> = {};
    vars.forEach((v) => (next[v] = ''));
    setValues(next);
  }, [active?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const vars = useMemo(() => {
    if (!active) return [] as string[];
    return active.variables?.length ? active.variables : extractVariables(active.content);
  }, [active]);

  const rendered = useMemo(
    () => (active ? renderTemplate(active.content, values) : ''),
    [active, values],
  );

  const save = async () => {
    if (!draft || !draft.name.trim() || !draft.content.trim()) {
      toast.error('名称和内容不能为空');
      return;
    }
    const payload = {
      name: draft.name.trim(),
      description: draft.description.trim() || null,
      content: draft.content,
      category: draft.category.trim() || null,
      model: draft.model.trim() || null,
      tags: draft.tagsText
        .split(/[,，\s]+/)
        .map((t) => t.trim())
        .filter(Boolean),
    };
    try {
      if (draft.id) {
        await api.patch(`/api/prompt-template/${draft.id}`, payload);
        toast.success('模板已更新');
      } else {
        const row = await api.post<PromptTemplate>('/api/prompt-template', payload);
        setActiveId(row.id);
        toast.success('模板已创建');
      }
      setDraft(null);
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存失败');
    }
  };

  const remove = async (id: string) => {
    try {
      await api.del(`/api/prompt-template/${id}`);
      toast.success('已删除');
      if (activeId === id) setActiveId(null);
      void load();
    } catch {
      toast.error('删除失败');
    }
  };

  const copyResult = async () => {
    if (!active) return;
    const ok = await copyText(rendered);
    if (ok) {
      toast.success('已复制填充后的提示词');
      try {
        await api.post(`/api/prompt-template/${active.id}`);
      } catch {
        /* 计数失败不影响主流程 */
      }
    } else {
      toast.error('复制失败，请手动选择');
    }
  };

  const toInspiration = async () => {
    if (!active) return;
    try {
      await api.post('/api/inspiration', {
        title: `${active.name}（已填充）`,
        content: rendered,
        summary: truncate(rendered, 120),
        type: 'prompt',
        status: 'ongoing',
        tags: active.tags ?? [],
      });
      toast.success('已存入灵感素材库');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存失败');
    }
  };

  return (
    <PageShell wide>
      <PageHeader
        title="提示词模板库"
        desc="用 {{变量}} 占位，填完一键复制到任意模型"
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
                placeholder="搜索模板"
                className="h-8 w-48 pl-7 text-[13px]"
              />
            </div>
            <Button size="sm" variant="primary" onClick={() => setDraft(emptyDraft())}>
              <Plus size={14} /> 新建模板
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[280px_1fr]">
        {/* 模板列表 */}
        <div className="wb-card h-fit overflow-hidden">
          <div className="border-b border-[var(--border-soft)] px-3.5 py-2.5 text-xs font-medium text-ink-700">
            全部模板 <span className="text-ink-500">{items.length}</span>
          </div>
          <div className="max-h-[620px] overflow-y-auto p-1.5">
            {loading && items.length === 0 && (
              <div className="flex items-center justify-center gap-2 py-8 text-[11px] text-ink-500">
                <Loader2 size={12} className="animate-spin" /> 加载中…
              </div>
            )}
            {!loading && items.length === 0 && (
              <EmptyState compact icon={<Braces size={22} />} title="还没有模板" />
            )}
            {items.map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveId(t.id)}
                className={`mb-0.5 block w-full rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-brand-50 ${
                  active?.id === t.id ? 'bg-brand-50' : ''
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[12.5px] font-medium text-ink-900">
                    {t.name}
                  </span>
                  <span className="shrink-0 text-[10px] text-ink-500">×{t.usageCount}</span>
                </div>
                <p className="mt-0.5 line-clamp-1 text-[11px] text-ink-500">
                  {t.description || truncate(t.content, 40)}
                </p>
              </button>
            ))}
          </div>
        </div>

        {/* 详情 + 填充 */}
        {active ? (
          <div className="space-y-3">
            <div className="wb-card px-4 py-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold text-ink-900">{active.name}</h2>
                  <p className="mt-1 text-xs text-ink-500">{active.description || '无描述'}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    {active.category && <span className="wb-tag">{active.category}</span>}
                    {active.model && <span className="wb-tag">{active.model}</span>}
                    <TagList tags={active.tags} max={4} />
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setDraft({
                        id: active.id,
                        name: active.name,
                        description: active.description ?? '',
                        content: active.content,
                        category: active.category ?? '',
                        model: active.model ?? '',
                        tagsText: (active.tags ?? []).join(', '),
                      })
                    }
                  >
                    编辑
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-status-abandoned"
                    onClick={() => void remove(active.id)}
                  >
                    <Trash2 size={13} />
                  </Button>
                </div>
              </div>
            </div>

            {vars.length > 0 && (
              <div className="wb-card px-4 py-3.5">
                <div className="mb-2 flex items-center gap-1.5">
                  <Wand2 size={13} className="text-brand-400" />
                  <h3 className="text-xs font-medium text-ink-700">填充变量</h3>
                  <span className="text-[10px] text-ink-500">{vars.length} 个</span>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {vars.map((v) => (
                    <Field key={v} label={<span className="font-mono">{`{{${v}}}`}</span>}>
                      <Input
                        value={values[v] ?? ''}
                        onChange={(e) => setValues((prev) => ({ ...prev, [v]: e.target.value }))}
                        placeholder={`填写 ${v}`}
                        className="h-8 text-[12.5px]"
                      />
                    </Field>
                  ))}
                </div>
              </div>
            )}

            <div className="wb-card overflow-hidden">
              <div className="flex items-center justify-between border-b border-[var(--border-soft)] px-4 py-2.5">
                <h3 className="text-xs font-medium text-ink-700">预览（已填充）</h3>
                <div className="flex items-center gap-1.5">
                  <Button size="sm" variant="subtle" onClick={() => void toInspiration()}>
                    <Save size={12} /> 存入灵感
                  </Button>
                  <Button size="sm" variant="primary" onClick={() => void copyResult()}>
                    <Copy size={12} /> 复制
                  </Button>
                </div>
              </div>
              <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap break-words bg-brand-900 px-4 py-3 font-mono text-[12.5px] leading-6 text-brand-100">
                {rendered}
              </pre>
            </div>
          </div>
        ) : (
          <div className="wb-card">
            <EmptyState
              icon={<Braces size={30} />}
              title="选择或新建一个模板"
              desc="模板正文里用 {{变量名}} 占位，右侧会自动生成填写表单"
            />
          </div>
        )}
      </div>

      {/* 新建 / 编辑 */}
      <Modal
        open={Boolean(draft)}
        onClose={() => setDraft(null)}
        title={draft?.id ? '编辑模板' : '新建模板'}
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
            <Field label="模板名称" required>
              <Input
                value={draft.name}
                autoFocus
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="例如：分镜图生成 · 通用"
              />
            </Field>
            <Field label="描述">
              <Textarea
                rows={2}
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              />
            </Field>
            <div className="grid grid-cols-3 gap-2">
              <Field label="分类">
                <Input
                  value={draft.category}
                  onChange={(e) => setDraft({ ...draft, category: e.target.value })}
                  placeholder="出图 / 写作"
                />
              </Field>
              <Field label="适用模型">
                <Input
                  value={draft.model}
                  onChange={(e) => setDraft({ ...draft, model: e.target.value })}
                  placeholder="deepseek / flux"
                />
              </Field>
              <Field label="标签">
                <Input
                  value={draft.tagsText}
                  onChange={(e) => setDraft({ ...draft, tagsText: e.target.value })}
                  placeholder="分镜, 出图"
                />
              </Field>
            </div>
            <Field
              label="模板正文"
              hint="用 {{变量名}} 占位，保存时自动解析变量列表"
            >
              <MarkdownEditor
                value={draft.content}
                onChange={(v) => setDraft({ ...draft, content: v })}
                height={280}
              />
            </Field>
          </div>
        )}
      </Modal>
    </PageShell>
  );
}
