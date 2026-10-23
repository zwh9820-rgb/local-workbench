'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Bot,
  Braces,
  CalendarDays,
  Check,
  ClipboardList,
  Flame,
  Lightbulb,
  ListTodo,
  Loader2,
  NotebookPen,
  Plus,
  Sparkles,
} from 'lucide-react';
import type { AgentSession, AiHot, DailyReview, Event, Inspiration, TodoItem } from '@/db/schema';
import { api } from '@/lib/api';
import { formatTime, relativeTime, weekdayLabel, fromDateKey, todayKey } from '@/lib/date';
import { truncate } from '@/lib/utils';
import { Card, CardBody, CardHeader, StatCard } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageShell } from '@/components/layout/PageShell';
import { toast } from '@/components/ui/Toast';

type DashboardData = {
  today: string;
  todo: {
    todayTotal: number;
    todayDone: number;
    weekTotal: number;
    weekDone: number;
    todayPending: TodoItem[];
    weekPending: TodoItem[];
  };
  events: Event[];
  inspiration: {
    ongoing: number;
    paused: number;
    finished: number;
    abandoned: number;
    total: number;
    recent: Inspiration[];
  };
  aiHot: AiHot[];
  review: DailyReview | null;
  clipboardCount: number;
  templateCount: number;
  agent: { total: number; recent: AgentSession[] };
};

/** 总览首页：聚合所有模块的关键数据 */
export function DashboardClient() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<DashboardData>('/api/dashboard');
      setData(res);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '加载总览失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const today = data?.today ?? todayKey();
  const dateObj = fromDateKey(today);

  const toggleTodo = async (item: TodoItem) => {
    try {
      await api.patch(`/api/todo/${item.id}`, {
        status: item.status === 'done' ? 'pending' : 'done',
      });
      void load();
    } catch {
      toast.error('操作失败');
    }
  };

  if (loading && !data) {
    return (
      <PageShell>
        <div className="flex items-center justify-center gap-2 py-24 text-xs text-ink-500">
          <Loader2 size={14} className="animate-spin" /> 正在汇总今日数据…
        </div>
      </PageShell>
    );
  }

  if (!data) return null;

  const todayPercent = data.todo.todayTotal
    ? Math.round((data.todo.todayDone / data.todo.todayTotal) * 100)
    : 0;

  return (
    <PageShell wide>
      {/* 欢迎区 */}
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] text-ink-500">
            {today} 周{weekdayLabel(dateObj)}
          </p>
          <h1 className="mt-0.5 text-lg font-semibold tracking-tight text-ink-900">
            今天先把最要紧的一件做完
          </h1>
          <p className="mt-1 text-xs text-ink-500">
            今日待办完成 {data.todo.todayDone}/{data.todo.todayTotal} · 本周{' '}
            {data.todo.weekDone}/{data.todo.weekTotal}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/inspiration?new=1">
            <Button size="sm" variant="secondary">
              <Plus size={13} /> 新建灵感
            </Button>
          </Link>
          <Link href="/today-todo?new=1">
            <Button size="sm" variant="secondary">
              <Plus size={13} /> 新建待办
            </Button>
          </Link>
          <Link href="/agent">
            <Button size="sm" variant="primary">
              <Sparkles size={13} /> 问 Agent
            </Button>
          </Link>
        </div>
      </div>

      {/* 指标卡 */}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard
          label="今日待办"
          value={`${data.todo.todayDone}/${data.todo.todayTotal}`}
          hint={`完成率 ${todayPercent}%`}
          icon={<ListTodo size={15} />}
          accent="active"
        />
        <StatCard
          label="本周任务"
          value={`${data.todo.weekDone}/${data.todo.weekTotal}`}
          hint="含今日"
          icon={<CalendarDays size={15} />}
        />
        <StatCard
          label="灵感素材"
          value={data.inspiration.total}
          unit="条"
          hint={`进行中 ${data.inspiration.ongoing} · 暂停 ${data.inspiration.paused}`}
          icon={<Lightbulb size={15} />}
          accent="paused"
        />
        <StatCard
          label="剪贴板快照"
          value={data.clipboardCount}
          unit="条"
          hint="复制即入库"
          icon={<ClipboardList size={15} />}
          accent="done"
        />
        <StatCard
          label="Agent 会话"
          value={data.agent.total}
          unit="个"
          hint={`提示词模板 ${data.templateCount} 个`}
          icon={<Bot size={15} />}
          accent="brand"
        />
      </div>

      {/* 主内容网格 */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {/* 今日待办 */}
        <Card className="lg:col-span-2">
          <CardHeader
            title="今日待办"
            desc={`${data.todo.todayDone} 已完成 / ${data.todo.todayTotal} 总计`}
            icon={<ListTodo size={14} />}
            extra={
              <Link
                href="/today-todo"
                className="flex items-center gap-0.5 text-[11px] text-brand-500 hover:text-brand-600"
              >
                全部 <ArrowRight size={11} />
              </Link>
            }
          />
          <CardBody className="space-y-1">
            {data.todo.todayPending.length === 0 ? (
              <EmptyState
                compact
                icon={<Check size={22} />}
                title={data.todo.todayTotal ? '今天的任务都完成了' : '今天还没有安排'}
                desc={data.todo.todayTotal ? '留点时间给灵感' : '按 Ctrl+T 快速添加'}
              />
            ) : (
              data.todo.todayPending.map((t) => (
                <div
                  key={t.id}
                  className="group flex items-center gap-2 rounded-lg px-1.5 py-1.5 transition-colors hover:bg-brand-50/60"
                >
                  <button
                    onClick={() => void toggleTodo(t)}
                    className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-ink-300 transition-colors hover:border-brand-400"
                  >
                    {t.status === 'doing' && <span className="h-1.5 w-1.5 rounded-full bg-status-active" />}
                  </button>
                  <span className="min-w-0 flex-1 truncate text-[13px] text-ink-900">
                    {t.title}
                  </span>
                  <span className="shrink-0 text-[10px] text-ink-500">{t.priority}</span>
                </div>
              ))
            )}
          </CardBody>
        </Card>

        {/* 今日日程 */}
        <Card>
          <CardHeader
            title="今日日程"
            desc={`${data.events.length} 项`}
            icon={<CalendarDays size={14} />}
            extra={
              <Link href="/calendar" className="text-[11px] text-brand-500 hover:text-brand-600">
                日历
              </Link>
            }
          />
          <CardBody className="space-y-2">
            {data.events.length === 0 ? (
              <EmptyState compact icon={<CalendarDays size={22} />} title="今天没有日程" />
            ) : (
              data.events.map((e) => (
                <div key={e.id} className="flex items-start gap-2">
                  <span className="mt-0.5 w-9 shrink-0 text-[11px] tabular-nums text-brand-500">
                    {formatTime(e.startAt)}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-[12.5px] text-ink-900">{e.title}</p>
                    {e.category && <span className="wb-tag mt-0.5">{e.category}</span>}
                  </div>
                </div>
              ))
            )}
          </CardBody>
        </Card>

        {/* 灵感动态 */}
        <Card className="lg:col-span-2">
          <CardHeader
            title="灵感动态"
            desc="最近更新的素材"
            icon={<Lightbulb size={14} />}
            extra={
              <Link href="/inspiration" className="text-[11px] text-brand-500 hover:text-brand-600">
                灵感库
              </Link>
            }
          />
          <CardBody className="space-y-1">
            {data.inspiration.recent.length === 0 ? (
              <EmptyState compact icon={<Lightbulb size={22} />} title="还没有素材" />
            ) : (
              data.inspiration.recent.map((i) => (
                <Link
                  key={i.id}
                  href={`/inspiration?id=${i.id}`}
                  className="flex items-center gap-2 rounded-lg px-1.5 py-1.5 transition-colors hover:bg-brand-50/60"
                >
                  <StatusBadge status={i.status} />
                  <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-900">
                    {i.title}
                  </span>
                  <span className="shrink-0 text-[10px] text-ink-500">
                    {relativeTime(i.updatedAt)}
                  </span>
                </Link>
              ))
            )}
          </CardBody>
        </Card>

        {/* 今日复盘 */}
        <Card>
          <CardHeader
            title="今日复盘"
            desc={data.review ? '已记录' : '还没写'}
            icon={<NotebookPen size={14} />}
            extra={
              <Link href="/review" className="text-[11px] text-brand-500 hover:text-brand-600">
                {data.review ? '查看' : '去写'}
              </Link>
            }
          />
          <CardBody>
            {data.review ? (
              <div className="space-y-2">
                <p className="line-clamp-3 text-[12.5px] leading-5 text-ink-700">
                  {data.review.summary || truncate(data.review.content, 120) || '（无摘要）'}
                </p>
                <div className="flex items-center gap-2 text-[10px] text-ink-500">
                  <span>心情 {data.review.moodScore ?? '-'}/5</span>
                  <span>精力 {data.review.energyScore ?? '-'}/5</span>
                </div>
              </div>
            ) : (
              <EmptyState
                compact
                icon={<NotebookPen size={22} />}
                title="今天还没复盘"
                desc="Ctrl+R 打开复盘"
              />
            )}
          </CardBody>
        </Card>

        {/* AI 热点 */}
        <Card>
          <CardHeader
            title="AI 热点"
            icon={<Flame size={14} />}
            extra={
              <Link href="/ai-hot" className="text-[11px] text-brand-500 hover:text-brand-600">
                全部
              </Link>
            }
          />
          <CardBody className="space-y-2">
            {data.aiHot.length === 0 ? (
              <EmptyState compact icon={<Flame size={22} />} title="暂无热点" />
            ) : (
              data.aiHot.slice(0, 3).map((h) => (
                <div key={h.id} className="flex items-start gap-2">
                  <Flame size={11} className="mt-1 shrink-0 text-status-paused" />
                  <div className="min-w-0">
                    <p className="line-clamp-2 text-[12px] leading-5 text-ink-900">{h.title}</p>
                    <p className="mt-0.5 text-[10px] text-ink-500">
                      {h.source ?? '未知来源'} · 热度 {h.heat}
                    </p>
                  </div>
                </div>
              ))
            )}
          </CardBody>
        </Card>

        {/* Agent 会话 */}
        <Card>
          <CardHeader
            title="Agent 会话"
            desc="最近的对话"
            icon={<Bot size={14} />}
            extra={
              <Link href="/agent" className="text-[11px] text-brand-500 hover:text-brand-600">
                打开
              </Link>
            }
          />
          <CardBody className="space-y-1">
            {data.agent.recent.length === 0 ? (
              <EmptyState compact icon={<Bot size={22} />} title="还没有会话" />
            ) : (
              data.agent.recent.map((s) => (
                <Link
                  key={s.id}
                  href={`/agent?session=${s.id}`}
                  className="flex items-center gap-2 rounded-lg px-1.5 py-1.5 transition-colors hover:bg-brand-50/60"
                >
                  <span className="min-w-0 flex-1 truncate text-[12px] text-ink-900">
                    {s.title}
                  </span>
                  <span className="shrink-0 text-[10px] text-ink-500">
                    {relativeTime(s.updatedAt)}
                  </span>
                </Link>
              ))
            )}
          </CardBody>
        </Card>

        {/* 提示词模板入口 */}
        <Card>
          <CardHeader title="提示词模板" icon={<Braces size={14} />} />
          <CardBody>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-semibold text-brand-500">{data.templateCount}</p>
                <p className="mt-0.5 text-[11px] text-ink-500">个模板可用 · 支持 {'{{变量}}'}</p>
              </div>
              <Link href="/prompt-template">
                <Button size="sm" variant="subtle">
                  去使用 <ArrowRight size={12} />
                </Button>
              </Link>
            </div>
          </CardBody>
        </Card>
      </div>
    </PageShell>
  );
}
