'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** 空状态占位 */
export function EmptyState({
  icon,
  title,
  desc,
  action,
  className,
  compact,
}: {
  icon?: ReactNode;
  title: string;
  desc?: ReactNode;
  action?: ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center',
        compact ? 'gap-1.5 py-6' : 'gap-2 py-12',
        className,
      )}
    >
      {icon && <div className="text-brand-200">{icon}</div>}
      <p className="text-sm font-medium text-ink-700">{title}</p>
      {desc && <p className="max-w-xs text-xs leading-5 text-ink-500">{desc}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
