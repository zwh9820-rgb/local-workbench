'use client';

import type { InspirationStatus, InspirationType, TodoPriority } from '@/db/schema';
import {
  INSPIRATION_STATUS_COLOR,
  INSPIRATION_STATUS_LABEL,
  INSPIRATION_TYPE_LABEL,
  TODO_PRIORITY_COLOR,
  TODO_PRIORITY_LABEL,
} from '@/lib/constants';
import { clampPercent, cn } from '@/lib/utils';

/** 灵感状态徽章：ongoing / paused / finished / abandoned */
export function StatusBadge({
  status,
  size = 'sm',
}: {
  status: InspirationStatus;
  size?: 'sm' | 'md';
}) {
  const c = INSPIRATION_STATUS_COLOR[status];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md font-medium',
        c.bg,
        c.text,
        size === 'sm' ? 'px-1.5 py-0.5 text-[11px]' : 'px-2 py-1 text-xs',
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', c.dot)} />
      {INSPIRATION_STATUS_LABEL[status]}
    </span>
  );
}

/** 素材类型徽章 */
export function TypeBadge({ type }: { type: InspirationType }) {
  return (
    <span className="inline-flex items-center rounded-md border border-[var(--border-soft)] px-1.5 py-0.5 text-[11px] text-ink-500">
      {INSPIRATION_TYPE_LABEL[type]}
    </span>
  );
}

/** 优先级 */
export function PriorityBadge({ priority }: { priority: TodoPriority }) {
  return (
    <span className={cn('text-[11px] font-medium', TODO_PRIORITY_COLOR[priority])}>
      {TODO_PRIORITY_LABEL[priority]}优先
    </span>
  );
}

/** 细进度条 */
export function ProgressBar({
  value,
  className,
  showLabel,
}: {
  value: number;
  className?: string;
  showLabel?: boolean;
}) {
  const p = clampPercent(value);
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-brand-50">
        <div
          className="h-full rounded-full bg-brand-400 transition-all"
          style={{ width: `${p}%` }}
        />
      </div>
      {showLabel && (
        <span className="w-8 text-right text-[11px] tabular-nums text-ink-500">{p}%</span>
      )}
    </div>
  );
}
