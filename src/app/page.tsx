import Link from 'next/link';
import {
  ArrowUpRight,
  CheckSquare,
  Frame,
  Lightbulb,
  NotebookPen,
  Plus,
  Radio,
} from 'lucide-react';
import { getOverview } from '@/server/queries/overview';
import { PageScroll } from '@/components/layout/page-container';
import { CanvasCard } from '@/components/canvas/canvas-card';
import { Card, CardHeader, EmptyState, PageHeader, SectionHeader } from '@/components/ui/card';
import { ProgressBar, StatusBadge, type StatusTone } from '@/components/ui/badge';
import { COMFY_STATUS_LABEL } from '@/lib/constants';
import { formatDateTime, timeAgo } from '@/lib/utils';
import type { ComfyTaskStatus } from '@/db/schema';

export const dynamic = 'force-dynamic';

const COMFY_TONE: Record<string, StatusTone> = {
  idle: 'idle',
  queued: 'warning',
  running: 'warning',
  done: 'success',
  error: 'error',
};

export default function OverviewPage() {
  const data = getOverview();
  const { stats } = data;

  const today = new Intl.DateTimeFormat('zh-CN', {
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  }).format(new Date());

  const todoPct = stats.todoTotal === 0 ? 0 : (stats.todoDone / stats.todoTotal) * 100;

  return (
    <PageScroll>
      <PageHeader
        title="总览"
        description={`${today} · 所有数据保存在本地`}
        actions={
          <Link
            href="/canvas?new=1"
            className="inline-flex h-7 items-center gap-1 rounded-md border border-line px-2 text-xs text-ink-secondary transition-colors hover:bg-app-hover hover:text-ink"
          >
            <Plus className="h-3.5 w-3.5" />
            新建画布
          </Link>
        }
      />

      {/* ------------------------------ 数据卡片 ------------------------------ */}
      <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
        <StatCard
          icon={<CheckSquare className="h-3.5 w-3.5" />}
          label="今日待办"
          value={`${stats.todoDone}/${stats.todoTotal}`}
          sub={
            stats.todoTotal === 0 ? (
              '今天还没有任务'
            ) : (
              <span className="block w-full">
                <ProgressBar
                  value={todoPct}
                  tone={todoPct === 100 ? 'success' : 'idle'}
                  className="mt-1.5"
                />
              </span>
            )
          }
          href="/todo"
        />
        <StatCard
          icon={<Lightbulb className="h-3.5 w-3.5" />}
          label="进行中灵感"
          value={String(stats.inspirationOngoing)}
          sub="含半成品与碎片"
          href="/inspiration"
        />
        <StatCard
          icon={<Frame className="h-3.5 w-3.5" />}
          label="项目画布"
          value={String(stats.canvasCount)}
          sub="一张画布 = 一个项目"
          href="/canvas"
        />
        <StatCard
          icon={<Radio className="h-3.5 w-3.5" />}
          label="ComfyUI 任务"
          value={String(stats.comfyActive)}
          sub={
            stats.comfyActive > 0 ? (
              <StatusBadge tone="warning" label="运行中" pulse />
            ) : (
              '暂无运行任务'
            )
          }
          href="/canvas"
        />
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-[1fr_320px]">
        {/* ----------------------------- 画布封面网格 ---------------------------- */}
        <section>
          <SectionHeader
            title="最近画布"
            count={data.canvases.length}
            actions={
              <Link
                href="/canvas"
                className="inline-flex items-center gap-0.5 text-2xs text-ink-muted transition-colors hover:text-ink"
              >
                全部 <ArrowUpRight className="h-3 w-3" />
              </Link>
            }
          />
          {data.canvases.length === 0 ? (
            <Card>
              <EmptyState
                icon={<Frame />}
                title="还没有画布"
                description="画布即项目。新建一张画布，把提示词、ComfyUI 工作流和生成结果都摊在无限画布上。"
                action={
                  <Link
                    href="/canvas?new=1"
                    className="inline-flex h-7 items-center gap-1 rounded-md bg-app-inverse px-2.5 text-xs text-ink-inverse"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    新建画布
                  </Link>
                }
              />
            </Card>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
              {data.canvases.slice(0, 8).map((c) => (
                <CanvasCard key={c.id} canvas={c} />
              ))}
            </div>
          )}
        </section>

        {/* -------------------------------- 右栏 -------------------------------- */}
        <aside className="space-y-4">
          {/* ComfyUI 任务状态 */}
          <Card>
            <CardHeader
              title="ComfyUI 任务"
              extra={
                <span className="text-2xs text-ink-muted">
                  {stats.comfyActive > 0 ? `${stats.comfyActive} 个运行中` : '空闲'}
                </span>
              }
            />
            {data.comfyTasks.length === 0 ? (
              <EmptyState
                compact
                title="暂无任务"
                description="在画布中添加 ComfyUI 节点并运行"
              />
            ) : (
              <ul className="divide-y divide-line">
                {data.comfyTasks.map((t) => {
                  const status = (t.status ?? 'idle') as ComfyTaskStatus;
                  const tone = COMFY_TONE[status] ?? 'idle';
                  const active = status === 'running' || status === 'queued';
                  return (
                    <li key={t.nodeId}>
                      <Link
                        href={`/canvas/${t.canvasId}?focus=${t.nodeId}`}
                        className="block px-3 py-2 transition-colors hover:bg-app-hover"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-xs text-ink">
                            {t.title || 'ComfyUI 任务'}
                          </span>
                          <StatusBadge
                            tone={tone}
                            label={COMFY_STATUS_LABEL[status]}
                            pulse={status === 'running'}
                          />
                        </div>
                        <div className="mt-1 flex items-center justify-between gap-2 text-2xs text-ink-muted">
                          <span className="truncate">{t.canvasName ?? '未知画布'}</span>
                          <span>{timeAgo(t.updatedAt)}</span>
                        </div>
                        {active && (
                          <ProgressBar value={t.progress ?? 0} tone={tone} className="mt-1.5" />
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          {/* 今日日程（events 表，第一版仅简易展示） */}
          <Card>
            <CardHeader title="今日日程" />
            {data.todayEvents.length === 0 ? (
              <EmptyState compact title="今天没有安排" />
            ) : (
              <ul className="divide-y divide-line">
                {data.todayEvents.map((e) => (
                  <li
                    key={e.id}
                    className="flex items-center justify-between gap-2 px-3 py-2"
                  >
                    <span className="truncate text-xs text-ink">{e.title}</span>
                    <span className="shrink-0 text-2xs text-ink-muted">
                      {e.allDay ? '全天' : formatDateTime(e.startAt).slice(6)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* 今日复盘 */}
          <Card>
            <CardHeader
              title="今日复盘"
              extra={
                <Link
                  href="/review"
                  className="text-2xs text-ink-muted transition-colors hover:text-ink"
                >
                  去写
                </Link>
              }
            />
            <div className="px-3 py-2.5">
              {data.todayReview ? (
                <>
                  <StatusBadge tone="success" label="已完成" />
                  <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-ink-secondary">
                    {data.todayReview.summary || '（未填写总结）'}
                  </p>
                </>
              ) : (
                <div className="flex items-center gap-2 text-xs text-ink-muted">
                  <NotebookPen className="h-3.5 w-3.5" />
                  今天还没复盘
                </div>
              )}
            </div>
          </Card>

          {/* 灵感动态 */}
          {data.inspirations.length > 0 && (
            <Card>
              <CardHeader
                title="灵感动态"
                extra={
                  <Link
                    href="/inspiration"
                    className="text-2xs text-ink-muted transition-colors hover:text-ink"
                  >
                    全部
                  </Link>
                }
              />
              <ul className="divide-y divide-line">
                {data.inspirations.map((i) => (
                  <li key={i.id}>
                    <Link
                      href={`/inspiration?focus=${i.id}`}
                      className="flex items-center justify-between gap-2 px-3 py-2 transition-colors hover:bg-app-hover"
                    >
                      <span className="truncate text-xs text-ink">{i.title}</span>
                      <span className="shrink-0 text-2xs text-ink-muted">
                        {i.progress}%
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </aside>
      </div>
    </PageScroll>
  );
}

/* ------------------------------- 数据卡片 -------------------------------- */

function StatCard({
  icon,
  label,
  value,
  sub,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: React.ReactNode;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-md border border-line bg-app-panel px-3 py-2.5 transition-colors hover:border-line-strong"
    >
      <div className="flex items-center gap-1.5 text-2xs text-ink-muted">
        {icon}
        <span>{label}</span>
      </div>
      <div className="mt-1.5 text-[20px] font-semibold leading-6 tracking-tight text-ink">
        {value}
      </div>
      <div className="mt-0.5 text-2xs text-ink-muted">{sub}</div>
    </Link>
  );
}
