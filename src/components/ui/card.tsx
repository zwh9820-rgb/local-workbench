import type { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/* -------------------------------- 页面容器 -------------------------------- */

export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-start justify-between gap-4', className)}>
      <div className="min-w-0">
        <h1 className="text-[15px] font-semibold tracking-tight text-ink">{title}</h1>
        {description && (
          <p className="mt-0.5 text-xs leading-5 text-ink-secondary">{description}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

export function SectionHeader({
  title,
  count,
  actions,
  className,
}: {
  title: ReactNode;
  count?: number;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mb-2 flex items-center justify-between gap-3', className)}>
      <div className="flex items-center gap-1.5">
        <h2 className="text-xs font-medium text-ink-secondary">{title}</h2>
        {typeof count === 'number' && (
          <span className="text-2xs text-ink-muted">{count}</span>
        )}
      </div>
      {actions && <div className="flex items-center gap-1">{actions}</div>}
    </div>
  );
}

/* --------------------------------- 卡片 ---------------------------------- */

export function Card({
  children,
  className,
  onClick,
  hoverable = false,
}: {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  hoverable?: boolean;
}) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'rounded-md border border-line bg-app-panel',
        hoverable &&
          'cursor-pointer transition-colors duration-150 hover:border-line-strong hover:bg-app-hover',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  extra,
  className,
}: {
  title: ReactNode;
  extra?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-2 border-b border-line px-3 py-2',
        className,
      )}
    >
      <span className="text-xs font-medium text-ink">{title}</span>
      {extra}
    </div>
  );
}

/* -------------------------------- 空状态 --------------------------------- */

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  compact = false,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center',
        compact ? 'gap-1 py-6' : 'gap-2 py-14',
        className,
      )}
    >
      {icon && <div className="mb-1 text-ink-muted [&>svg]:h-5 [&>svg]:w-5">{icon}</div>}
      <p className="text-[13px] font-medium text-ink-secondary">{title}</p>
      {description && (
        <p className="max-w-[320px] text-xs leading-5 text-ink-muted">{description}</p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/* -------------------------------- 加载态 --------------------------------- */

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('h-3.5 w-3.5 animate-spin text-ink-muted', className)} />;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded bg-app-active', className)} />;
}

/** 骨架屏列表（虚拟滚动前的占位） */
export function SkeletonList({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}
