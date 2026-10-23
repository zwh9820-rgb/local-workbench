'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { CalendarDays, Loader2, NotebookPen, Save, Sparkles } from 'lucide-react';
import type { DailyReview } from '@/db/schema';
import { api, qs } from '@/lib/api';
import { todayKey } from '@/lib/date';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Field, Input, Textarea } from '@/components/ui/Input';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader, PageShell } from '@/components/layout/PageShell';
import { MarkdownEditor } from '@/components/editor/MarkdownEditor';
import { toast } from '@/components/ui/Toast';

const SCORE_LABEL: Record<number, string> = {
  1: '很差',
  2: '偏低',
  3: '一般',
  4: '不错',
  5: '很好',
};

/** 每日复盘：一天一条，按日期 upsert */
export function ReviewClient() {
  const params = useSearchParams();
  const [date, setDate] = useState(params.get('date') ?? todayKey());
  const [recent, setRecent] = useState<DailyReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);

  const [form, setForm] = useState({
    summary: '',
    wellDone: '',
    problems: '',
    improvements: '',
    tomorrowPlan: '',
    content: '',
    moodScore: 3 as number,
    energyScore: 3 as number,
  });

  const loadRecent = useCallback(async () => {
    try {
      const rows = await api.get<DailyReview[]>('/api/review?limit=20');
      setRecent(rows);
    } catch {
      /* 忽略 */
    }
  }, []);

  const loadDate = useCallback(async (key: string) => {
    setLoading(true);
    try {
      const row = await api.get<DailyReview | null>(`/api/review${qs({ date: key })}`);
      setForm({
        summary: row?.summary ?? '',
        wellDone: row?.wellDone ?? '',
        problems: row?.problems ?? '',
        improvements: row?.improvements ?? '',
        tomorrowPlan: row?.tomorrowPlan ?? '',
        content: row?.content ?? '',
        moodScore: row?.moodScore ?? 3,
        energyScore: row?.energyScore ?? 3,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRecent();
  }, [loadRecent]);

  useEffect(() => {
    void loadDate(date);
  }, [date, loadDate]);

  const save = async () => {
    setSaving(true);
    try {
      await api.post('/api/review', { reviewDate: date, ...form });
      toast.success('复盘已保存');
      void loadRecent();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  /** 让本地 Agent 根据今日待办生成一份草稿，填进正文 */
  const generate = async () => {
    setGenerating(true);
    try {
      const res = await api.post<{ assistantText: string; sessionId: string }>(
        '/api/agent/chat',
        {
          message: `请帮我写 ${date} 的今日复盘草稿。先用 listTodo 查看今天的待办完成情况，然后输出一份 Markdown 复盘，包含：今日完成、未完成及原因、做得好的地方、需要改进的地方、明日重点。直接输出 Markdown 正文，不要调用 createReview 工具，也不要说多余的话。`,
          mode: 'workbench',
        },
      );
      setForm((f) => ({ ...f, content: res.assistantText }));
      toast.success('草稿已生成，记得检查后再保存');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '生成失败，检查 LM Studio 是否启动');
    } finally {
      setGenerating(false);
    }
  };

  const shiftDate = (delta: number) => {
    const d = new Date(`${date}T00:00:00`);
    d.setDate(d.getDate() + delta);
    setDate(d.toISOString().slice(0, 10));
  };

  return (
    <PageShell>
      <PageHeader
        title="今日复盘"
        desc="每天 10 分钟，把今天变成明天的输入"
        actions={
          <>
            <div className="flex items-center gap-1">
              <Button size="sm" variant="ghost" onClick={() => shiftDate(-1)}>
                前一天
              </Button>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="h-8 w-[136px] text-[12px]"
              />
              <Button size="sm" variant="ghost" onClick={() => shiftDate(1)}>
                后一天
              </Button>
            </div>
            <Button size="sm" variant="secondary" onClick={() => void generate()} loading={generating}>
              <Sparkles size={14} /> AI 生成草稿
            </Button>
            <Button size="sm" variant="primary" onClick={() => void save()} loading={saving}>
              <Save size={14} /> 保存复盘
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_260px]">
        <div className="space-y-3">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-xs text-ink-500">
              <Loader2 size={14} className="animate-spin" /> 加载中…
            </div>
          ) : (
            <>
              {/* 状态评分 */}
              <div className="wb-card grid grid-cols-2 gap-4 px-4 py-3">
                {(
                  [
                    ['moodScore', '心情'],
                    ['energyScore', '精力'],
                  ] as const
                ).map(([key, label]) => (
                  <div key={key}>
                    <p className="text-xs text-ink-500">{label}</p>
                    <div className="mt-1.5 flex items-center gap-1">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button
                          key={n}
                          onClick={() => setForm((f) => ({ ...f, [key]: n }))}
                          className={cn(
                            'h-7 w-7 rounded-md text-[11px] font-medium transition-colors',
                            form[key] >= n
                              ? 'bg-brand-500 text-white'
                              : 'bg-brand-50 text-ink-500 hover:bg-brand-100',
                          )}
                        >
                          {n}
                        </button>
                      ))}
                      <span className="ml-1 text-[11px] text-ink-500">
                        {SCORE_LABEL[form[key]]}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="wb-card space-y-3 px-4 py-3.5">
                <Field label="一句话总结">
                  <Input
                    value={form.summary}
                    onChange={(e) => setForm((f) => ({ ...f, summary: e.target.value }))}
                    placeholder="今天整体怎么样？"
                  />
                </Field>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="做得好的">
                    <Textarea
                      rows={3}
                      value={form.wellDone}
                      onChange={(e) => setForm((f) => ({ ...f, wellDone: e.target.value }))}
                      placeholder="写具体的事，别写「还行」"
                    />
                  </Field>
                  <Field label="遇到的问题">
                    <Textarea
                      rows={3}
                      value={form.problems}
                      onChange={(e) => setForm((f) => ({ ...f, problems: e.target.value }))}
                      placeholder="卡在哪里"
                    />
                  </Field>
                  <Field label="改进措施">
                    <Textarea
                      rows={3}
                      value={form.improvements}
                      onChange={(e) => setForm((f) => ({ ...f, improvements: e.target.value }))}
                      placeholder="下次怎么做"
                    />
                  </Field>
                  <Field label="明日重点">
                    <Textarea
                      rows={3}
                      value={form.tomorrowPlan}
                      onChange={(e) => setForm((f) => ({ ...f, tomorrowPlan: e.target.value }))}
                      placeholder="最多三件"
                    />
                  </Field>
                </div>
              </div>

              <Field label="复盘正文（Markdown，可选）">
                <MarkdownEditor
                  value={form.content}
                  onChange={(v) => setForm((f) => ({ ...f, content: v }))}
                  height={300}
                />
              </Field>
            </>
          )}
        </div>

        {/* 历史复盘 */}
        <div className="wb-card h-fit">
          <div className="flex items-center gap-2 border-b border-[var(--border-soft)] px-3.5 py-2.5">
            <NotebookPen size={14} className="text-brand-400" />
            <h3 className="text-xs font-medium text-ink-700">历史复盘</h3>
            <span className="text-[10px] text-ink-500">{recent.length}</span>
          </div>
          <div className="max-h-[560px] overflow-y-auto p-2">
            {recent.length === 0 ? (
              <EmptyState compact icon={<CalendarDays size={22} />} title="还没有复盘记录" />
            ) : (
              recent.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setDate(r.reviewDate)}
                  className={cn(
                    'mb-1 block w-full rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-brand-50',
                    r.reviewDate === date && 'bg-brand-50',
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] font-medium text-ink-900">{r.reviewDate}</span>
                    <span className="text-[10px] text-ink-500">
                      心情 {r.moodScore ?? '-'} / 精力 {r.energyScore ?? '-'}
                    </span>
                  </div>
                  <p className="mt-0.5 line-clamp-1 text-[11px] text-ink-500">
                    {r.summary || r.content || '（无摘要）'}
                  </p>
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    </PageShell>
  );
}
