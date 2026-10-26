'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarDays, ChevronLeft, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { createEvent, deleteEvent } from '@/server/actions/event';
import { PageScroll } from '@/components/layout/page-container';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Textarea } from '@/components/ui/input';
import { Card, EmptyState, PageHeader } from '@/components/ui/card';
import { cn, dateKey } from '@/lib/utils';

interface EventItem {
  id: string;
  title: string;
  description: string | null;
  startAt: Date;
  endAt: Date | null;
  allDay: boolean;
  location: string | null;
}

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'];

/** 生成月视图网格（周一起始） */
function buildMatrix(month: string): Array<{ date: string; inMonth: boolean }> {
  const [y, m] = month.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const startOffset = (first.getDay() + 6) % 7; // 周一 = 0
  const daysInMonth = new Date(y, m, 0).getDate();

  const cells: Array<{ date: string; inMonth: boolean }> = [];

  for (let i = startOffset; i > 0; i -= 1) {
    const d = new Date(y, m - 1, 1 - i);
    cells.push({ date: dateKey(d), inMonth: false });
  }
  for (let d = 1; d <= daysInMonth; d += 1) {
    cells.push({ date: `${month}-${String(d).padStart(2, '0')}`, inMonth: true });
  }
  while (cells.length % 7 !== 0) {
    const last = new Date(`${cells[cells.length - 1].date}T00:00:00`);
    last.setDate(last.getDate() + 1);
    cells.push({ date: dateKey(last), inMonth: false });
  }

  return cells;
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function CalendarClient({
  initialMonth,
  initialEvents,
}: {
  initialMonth: string;
  initialEvents: EventItem[];
}) {
  const router = useRouter();
  const [events, setEvents] = useState(initialEvents);
  const [selected, setSelected] = useState(dateKey());
  const [creating, setCreating] = useState(false);
  const [, startTransition] = useTransition();

  const month = initialMonth;
  const today = dateKey();
  const cells = useMemo(() => buildMatrix(month), [month]);

  const byDate = useMemo(() => {
    const map = new Map<string, EventItem[]>();
    for (const e of events) {
      const key = dateKey(new Date(e.startAt));
      const arr = map.get(key) ?? [];
      arr.push(e);
      map.set(key, arr);
    }
    return map;
  }, [events]);

  const selectedEvents = byDate.get(selected) ?? [];

  const goMonth = (delta: number) => {
    router.push(`/calendar?month=${shiftMonth(month, delta)}`);
  };

  const removeEvent = async (id: string) => {
    setEvents((prev) => prev.filter((e) => e.id !== id));
    startTransition(async () => {
      await deleteEvent(id);
      router.refresh();
    });
  };

  const [y, m] = month.split('-').map(Number);

  return (
    <PageScroll maxWidth="max-w-[1080px]">
      <PageHeader
        title="日历"
        description="日程与提醒，和待办、复盘共用一套时间轴"
        actions={
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon-sm" onClick={() => goMonth(-1)}>
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <button
              type="button"
              onClick={() => router.push('/calendar')}
              className="h-7 rounded-md px-2 text-xs text-ink-secondary transition-colors hover:bg-app-hover hover:text-ink"
            >
              {y} 年 {m} 月
            </button>
            <Button variant="ghost" size="icon-sm" onClick={() => goMonth(1)}>
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="primary"
              size="sm"
              icon={<Plus />}
              onClick={() => setCreating(true)}
              className="ml-1"
            >
              新建
            </Button>
          </div>
        }
      />

      <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_300px]">
        {/* 月视图 */}
        <Card className="overflow-hidden">
          <div className="grid grid-cols-7 border-b border-line">
            {WEEKDAYS.map((w) => (
              <div
                key={w}
                className="py-1.5 text-center text-2xs text-ink-muted"
              >
                {w}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7">
            {cells.map((cell) => {
              const dayEvents = byDate.get(cell.date) ?? [];
              const isToday = cell.date === today;
              const isSelected = cell.date === selected;
              const dayNum = Number(cell.date.slice(-2));

              return (
                <button
                  key={cell.date}
                  type="button"
                  onClick={() => setSelected(cell.date)}
                  className={cn(
                    'relative flex h-[74px] flex-col items-start gap-0.5 border-b border-r border-line p-1.5 text-left transition-colors',
                    !cell.inMonth && 'bg-app-panel/40',
                    isSelected ? 'bg-app-active' : 'hover:bg-app-hover',
                  )}
                >
                  <span
                    className={cn(
                      'flex h-5 w-5 items-center justify-center rounded-full text-2xs',
                      isToday
                        ? 'bg-app-inverse font-medium text-ink-inverse'
                        : cell.inMonth
                          ? 'text-ink'
                          : 'text-ink-muted',
                    )}
                  >
                    {dayNum}
                  </span>

                  <span className="w-full space-y-0.5 overflow-hidden">
                    {dayEvents.slice(0, 2).map((e) => (
                      <span
                        key={e.id}
                        className="block truncate rounded-sm bg-app-hover px-1 text-[10px] leading-4 text-ink-secondary"
                      >
                        {e.title}
                      </span>
                    ))}
                    {dayEvents.length > 2 && (
                      <span className="block text-[10px] text-ink-muted">
                        +{dayEvents.length - 2}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </Card>

        {/* 当天事件 */}
        <aside>
          <div className="mb-2 flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs font-medium text-ink-secondary">
              <CalendarDays className="h-3.5 w-3.5" />
              {selected}
            </span>
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="text-2xs text-ink-muted transition-colors hover:text-ink"
            >
              添加
            </button>
          </div>

          <Card className="overflow-hidden">
            {selectedEvents.length === 0 ? (
              <EmptyState compact title="这一天没有安排" />
            ) : (
              <ul className="divide-y divide-line">
                {selectedEvents.map((e) => (
                  <li
                    key={e.id}
                    className="group flex items-start gap-2 px-3 py-2"
                  >
                    <span className="mt-1 shrink-0 text-2xs text-ink-muted">
                      {e.allDay
                        ? '全天'
                        : new Date(e.startAt).toLocaleTimeString('zh-CN', {
                            hour: '2-digit',
                            minute: '2-digit',
                            hour12: false,
                          })}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs text-ink">{e.title}</span>
                      {e.description && (
                        <span className="mt-0.5 block truncate text-2xs text-ink-muted">
                          {e.description}
                        </span>
                      )}
                    </span>
                    <button
                      type="button"
                      onClick={() => void removeEvent(e.id)}
                      className="mt-0.5 shrink-0 text-ink-muted opacity-0 transition-opacity hover:text-[var(--error)] group-hover:opacity-100"
                      aria-label="删除"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </aside>
      </div>

      <CreateEventDialog
        open={creating}
        defaultDate={selected}
        onClose={() => setCreating(false)}
        onCreated={(row) => {
          setEvents((prev) => [...prev, row]);
          setSelected(dateKey(new Date(row.startAt)));
          router.refresh();
        }}
      />
    </PageScroll>
  );
}

/* ------------------------------ 新建日程 ------------------------------- */

function CreateEventDialog({
  open,
  defaultDate,
  onClose,
  onCreated,
}: {
  open: boolean;
  defaultDate: string;
  onClose: () => void;
  onCreated: (row: EventItem) => void;
}) {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(defaultDate);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('');
  const [allDay, setAllDay] = useState(false);
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 打开时同步默认日期
  useEffect(() => {
    if (open) setDate(defaultDate);
  }, [open, defaultDate]);

  const submit = async () => {
    if (!title.trim()) {
      setError('请填写标题');
      return;
    }
    setSaving(true);
    try {
      const row = await createEvent({
        title,
        date,
        startTime: allDay ? null : startTime,
        endTime: allDay ? null : endTime || null,
        allDay,
        description: description || null,
      });
      onCreated({
        id: row.id,
        title: row.title,
        description: row.description,
        startAt: row.startAt,
        endAt: row.endAt,
        allDay: row.allDay,
        location: row.location,
      });
      setTitle('');
      setDescription('');
      setError(null);
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
      title="新建日程"
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
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) void submit();
            }}
          />
        </Field>

        <div className="grid grid-cols-3 gap-3">
          <Field label="日期">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="开始">
            <Input
              type="time"
              value={startTime}
              disabled={allDay}
              onChange={(e) => setStartTime(e.target.value)}
            />
          </Field>
          <Field label="结束">
            <Input
              type="time"
              value={endTime}
              disabled={allDay}
              onChange={(e) => setEndTime(e.target.value)}
            />
          </Field>
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-xs text-ink-secondary">
          <input
            type="checkbox"
            checked={allDay}
            onChange={(e) => setAllDay(e.target.checked)}
            className="h-3.5 w-3.5 accent-[var(--text-primary)]"
          />
          全天事件
        </label>

        <Field label="备注">
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="可选"
          />
        </Field>
      </div>
    </Dialog>
  );
}
