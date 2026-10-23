'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ChevronLeft, ChevronRight, Clock, MapPin, Plus, Trash2 } from 'lucide-react';
import type { Event } from '@/db/schema';
import { api, qs } from '@/lib/api';
import {
  formatTime,
  fromDateKey,
  isSameDay,
  monthMatrix,
  monthTitle,
  toDateKey,
  todayKey,
  weekdayLabel,
} from '@/lib/date';
import { cn, truncate } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select, Textarea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader, PageShell } from '@/components/layout/PageShell';
import { toast } from '@/components/ui/Toast';

type Draft = {
  id?: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  category: string;
  description: string;
};

const emptyDraft = (date: string): Draft => ({
  title: '',
  date,
  startTime: '09:00',
  endTime: '10:00',
  location: '',
  category: '',
  description: '',
});

/** 月视图日历 + 当天日程列表 */
export function CalendarClient() {
  const params = useSearchParams();
  const initialDate = params.get('date') ?? todayKey();
  const now = fromDateKey(initialDate);
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [selected, setSelected] = useState(initialDate);
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Draft | null>(null);

  const grid = useMemo(() => monthMatrix(year, month), [year, month]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await api.get<Event[]>(
        `/api/events${qs({
          from: toDateKey(grid[0]),
          to: toDateKey(grid[grid.length - 1]),
        })}`,
      );
      setEvents(rows);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '加载日程失败');
    } finally {
      setLoading(false);
    }
  }, [grid]);

  useEffect(() => {
    void load();
  }, [load]);

  /** 按日期分组，方便日历格子与右侧列表查询 */
  const byDate = useMemo(() => {
    const map = new Map<string, Event[]>();
    events.forEach((e) => {
      const key = toDateKey(new Date(e.startAt));
      const list = map.get(key) ?? [];
      list.push(e);
      map.set(key, list);
    });
    return map;
  }, [events]);

  const dayEvents = byDate.get(selected) ?? [];

  const openCreate = () => setDraft(emptyDraft(selected));

  const openEdit = (e: Event) => {
    const start = new Date(e.startAt);
    const end = e.endAt ? new Date(e.endAt) : null;
    setDraft({
      id: e.id,
      title: e.title,
      date: toDateKey(start),
      startTime: `${String(start.getHours()).padStart(2, '0')}:${String(
        start.getMinutes(),
      ).padStart(2, '0')}`,
      endTime: end
        ? `${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`
        : '',
      location: e.location ?? '',
      category: e.category ?? '',
      description: e.description ?? '',
    });
  };

  const save = async () => {
    if (!draft || !draft.title.trim()) {
      toast.error('请填写日程标题');
      return;
    }
    const startAt = new Date(`${draft.date}T${draft.startTime || '09:00'}:00`);
    const endAt = draft.endTime ? new Date(`${draft.date}T${draft.endTime}:00`) : null;

    try {
      if (draft.id) {
        await api.patch(`/api/events/${draft.id}`, {
          title: draft.title,
          startAt: startAt.toISOString(),
          endAt: endAt?.toISOString() ?? null,
          location: draft.location || null,
          category: draft.category || null,
          description: draft.description || null,
        });
        toast.success('已更新日程');
      } else {
        await api.post('/api/events', {
          title: draft.title,
          startAt: startAt.toISOString(),
          endAt: endAt?.toISOString() ?? null,
          location: draft.location || null,
          category: draft.category || null,
          description: draft.description || null,
        });
        toast.success('已添加日程');
      }
      setDraft(null);
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存失败');
    }
  };

  const remove = async (id: string) => {
    try {
      await api.del(`/api/events/${id}`);
      toast.success('已删除');
      void load();
    } catch {
      toast.error('删除失败');
    }
  };

  const shiftMonth = (delta: number) => {
    const d = new Date(year, month + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  };

  return (
    <PageShell wide>
      <PageHeader
        title="日历"
        desc="安排创作节奏，日程与待办分离管理"
        actions={
          <Button size="sm" variant="primary" onClick={openCreate}>
            <Plus size={14} /> 新建日程
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
        {/* 月视图 */}
        <div className="wb-card overflow-hidden">
          <div className="flex items-center justify-between border-b border-[var(--border-soft)] px-4 py-2.5">
            <h2 className="text-sm font-semibold text-ink-900">{monthTitle(year, month)}</h2>
            <div className="flex items-center gap-1">
              <Button size="icon" variant="ghost" onClick={() => shiftMonth(-1)}>
                <ChevronLeft size={15} />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  const d = new Date();
                  setYear(d.getFullYear());
                  setMonth(d.getMonth());
                  setSelected(todayKey());
                }}
              >
                今天
              </Button>
              <Button size="icon" variant="ghost" onClick={() => shiftMonth(1)}>
                <ChevronRight size={15} />
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-7 border-b border-[var(--border-soft)] bg-brand-50/40">
            {['一', '二', '三', '四', '五', '六', '日'].map((w) => (
              <div key={w} className="py-1.5 text-center text-[11px] text-ink-500">
                {w}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7">
            {grid.map((d) => {
              const key = toDateKey(d);
              const inMonth = d.getMonth() === month;
              const isToday = isSameDay(d, new Date());
              const list = byDate.get(key) ?? [];
              return (
                <button
                  key={key}
                  onClick={() => setSelected(key)}
                  className={cn(
                    'min-h-[82px] border-b border-r border-[var(--border-soft)] p-1.5 text-left align-top transition-colors last:border-r-0 hover:bg-brand-50/50',
                    !inMonth && 'bg-paper/60',
                    selected === key && 'bg-brand-50 ring-1 ring-inset ring-brand-300',
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={cn(
                        'flex h-5 w-5 items-center justify-center rounded text-[11px] tabular-nums',
                        !inMonth && 'text-ink-300',
                        inMonth && 'text-ink-700',
                        isToday && 'bg-brand-500 font-medium text-white',
                      )}
                    >
                      {d.getDate()}
                    </span>
                    {list.length > 0 && (
                      <span className="text-[9px] text-ink-500">{list.length}</span>
                    )}
                  </div>
                  <div className="mt-1 space-y-0.5">
                    {list.slice(0, 2).map((e) => (
                      <div
                        key={e.id}
                        className="truncate rounded bg-brand-100/70 px-1 py-0.5 text-[10px] text-brand-700"
                      >
                        {formatTime(e.startAt)} {truncate(e.title, 10)}
                      </div>
                    ))}
                    {list.length > 2 && (
                      <div className="pl-1 text-[9px] text-ink-500">+{list.length - 2}</div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* 当天列表 */}
        <div className="wb-card flex h-fit flex-col">
          <div className="flex items-center justify-between border-b border-[var(--border-soft)] px-4 py-2.5">
            <div>
              <h3 className="text-sm font-semibold text-ink-900">
                {selected} 周{weekdayLabel(fromDateKey(selected))}
              </h3>
              <p className="mt-0.5 text-[11px] text-ink-500">{dayEvents.length} 个日程</p>
            </div>
            <Button size="icon" variant="ghost" onClick={openCreate} title="新建">
              <Plus size={15} />
            </Button>
          </div>

          <div className="max-h-[520px] space-y-2 overflow-y-auto p-3">
            {dayEvents.length === 0 && !loading && (
              <EmptyState compact icon={<Clock size={24} />} title="这天没有日程" />
            )}
            {dayEvents.map((e) => (
              <div
                key={e.id}
                className="group rounded-lg border border-[var(--border-soft)] bg-paper px-3 py-2 transition-colors hover:border-brand-200"
              >
                <div className="flex items-start justify-between gap-2">
                  <button
                    onClick={() => openEdit(e)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <p className="truncate text-[13px] font-medium text-ink-900">{e.title}</p>
                    <p className="mt-0.5 flex items-center gap-1 text-[11px] text-ink-500">
                      <Clock size={10} />
                      {formatTime(e.startAt)}
                      {e.endAt ? ` - ${formatTime(e.endAt)}` : ''}
                      {e.category && <span className="ml-1 wb-tag">{e.category}</span>}
                    </p>
                    {e.location && (
                      <p className="mt-0.5 flex items-center gap-1 text-[11px] text-ink-500">
                        <MapPin size={10} /> {e.location}
                      </p>
                    )}
                    {e.description && (
                      <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-ink-500">
                        {e.description}
                      </p>
                    )}
                  </button>
                  <button
                    onClick={() => void remove(e.id)}
                    className="shrink-0 rounded p-1 text-ink-300 opacity-0 transition-opacity hover:text-status-abandoned group-hover:opacity-100"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 新建 / 编辑 */}
      <Modal
        open={Boolean(draft)}
        onClose={() => setDraft(null)}
        title={draft?.id ? '编辑日程' : '新建日程'}
        size="md"
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
                placeholder="例如：ComfyUI 工作流出图验收"
              />
            </Field>
            <div className="grid grid-cols-3 gap-2">
              <Field label="日期">
                <Input
                  type="date"
                  value={draft.date}
                  onChange={(e) => setDraft({ ...draft, date: e.target.value })}
                />
              </Field>
              <Field label="开始">
                <Input
                  type="time"
                  value={draft.startTime}
                  onChange={(e) => setDraft({ ...draft, startTime: e.target.value })}
                />
              </Field>
              <Field label="结束">
                <Input
                  type="time"
                  value={draft.endTime}
                  onChange={(e) => setDraft({ ...draft, endTime: e.target.value })}
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="地点">
                <Input
                  value={draft.location}
                  onChange={(e) => setDraft({ ...draft, location: e.target.value })}
                  placeholder="可选"
                />
              </Field>
              <Field label="分类">
                <Select
                  value={draft.category}
                  onChange={(e) => setDraft({ ...draft, category: e.target.value })}
                >
                  <option value="">未分类</option>
                  <option value="创作">创作</option>
                  <option value="会议">会议</option>
                  <option value="拍摄">拍摄</option>
                  <option value="发布">发布</option>
                  <option value="学习">学习</option>
                </Select>
              </Field>
            </div>
            <Field label="备注">
              <Textarea
                rows={3}
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              />
            </Field>
          </div>
        )}
      </Modal>
    </PageShell>
  );
}
