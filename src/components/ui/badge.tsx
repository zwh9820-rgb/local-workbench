'use client';

import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

/* ------------------------------- 通用标签 -------------------------------- */

export function Chip({
  children,
  className,
  onClick,
  active = false,
}: {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  active?: boolean;
}) {
  const base = cn(
    'inline-flex h-5 items-center gap-1 rounded-sm border px-1.5 text-2xs transition-colors',
    active
      ? 'border-line-strong bg-app-inverse text-ink-inverse'
      : 'border-line bg-app-hover text-ink-secondary',
    onClick && 'hover:border-line-strong hover:text-ink',
    className,
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={base}>
        {children}
      </button>
    );
  }
  return <span className={base}>{children}</span>;
}

/** 可删除标签 */
export function Tag({
  children,
  onRemove,
}: {
  children: ReactNode;
  onRemove?: () => void;
}) {
  return (
    <span className="inline-flex h-5 items-center gap-1 rounded-sm border border-line bg-app-hover px-1.5 text-2xs text-ink-secondary">
      {children}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="text-ink-muted transition-colors hover:text-ink"
          aria-label="移除标签"
        >
          <X className="h-2.5 w-2.5" />
        </button>
      )}
    </span>
  );
}

/* ------------------------------- 状态徽章 -------------------------------- */

export type StatusTone = 'success' | 'error' | 'warning' | 'idle';

const TONE_COLOR: Record<StatusTone, string> = {
  success: 'var(--success)',
  error: 'var(--error)',
  warning: 'var(--warning)',
  idle: 'var(--text-muted)',
};

/**
 * 状态徽章：小圆点 + 文字
 * 彩色只出现在这个圆点上，符合「黑白极简、仅状态少量彩色」的约束。
 */
export function StatusBadge({
  tone,
  label,
  pulse = false,
  className,
}: {
  tone: StatusTone;
  label: ReactNode;
  pulse?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 text-2xs text-ink-secondary',
        className,
      )}
    >
      <span
        className={cn('h-1.5 w-1.5 shrink-0 rounded-full', pulse && 'animate-progress-pulse')}
        style={{ backgroundColor: TONE_COLOR[tone] }}
      />
      {label}
    </span>
  );
}

/** 进度条：灰度轨道 + 状态色填充 */
export function ProgressBar({
  value,
  tone = 'idle',
  className,
}: {
  value: number;
  tone?: StatusTone;
  className?: string;
}) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className={cn('h-1 w-full overflow-hidden rounded-full bg-app-active', className)}>
      <div
        className="h-full rounded-full transition-[width] duration-300 ease-out"
        style={{ width: `${pct}%`, backgroundColor: TONE_COLOR[tone] }}
      />
    </div>
  );
}
