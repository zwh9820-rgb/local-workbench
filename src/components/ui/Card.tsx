import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function Card({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('wb-card', className)} {...rest}>
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  desc,
  extra,
  icon,
  className,
}: {
  title: ReactNode;
  desc?: ReactNode;
  extra?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex items-start justify-between gap-3 border-b border-[var(--border-soft)] px-4 py-3',
        className,
      )}
    >
      <div className="flex min-w-0 items-start gap-2.5">
        {icon && <span className="mt-0.5 text-brand-400">{icon}</span>}
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-ink-900">{title}</h3>
          {desc && <p className="mt-0.5 text-xs text-ink-500">{desc}</p>}
        </div>
      </div>
      {extra && <div className="shrink-0">{extra}</div>}
    </div>
  );
}

export function CardBody({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('px-4 py-3', className)} {...rest}>
      {children}
    </div>
  );
}

export function CardFooter({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex items-center justify-end gap-2 border-t border-[var(--border-soft)] px-4 py-2.5',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

/** 数据统计卡（总览页使用） */
export function StatCard({
  label,
  value,
  unit,
  hint,
  icon,
  accent = 'brand',
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  hint?: string;
  icon?: ReactNode;
  accent?: 'brand' | 'active' | 'paused' | 'done' | 'abandoned';
}) {
  const accentClass = {
    brand: 'text-brand-500',
    active: 'text-status-active',
    paused: 'text-status-paused',
    done: 'text-status-done',
    abandoned: 'text-status-abandoned',
  }[accent];

  return (
    <div className="wb-card px-4 py-3.5">
      <div className="flex items-center justify-between">
        <span className="text-xs text-ink-500">{label}</span>
        {icon && <span className={cn('opacity-70', accentClass)}>{icon}</span>}
      </div>
      <div className="mt-2 flex items-baseline gap-1">
        <span className={cn('text-2xl font-semibold tabular-nums', accentClass)}>{value}</span>
        {unit && <span className="text-xs text-ink-500">{unit}</span>}
      </div>
      {hint && <p className="mt-1 text-[11px] text-ink-500">{hint}</p>}
    </div>
  );
}
