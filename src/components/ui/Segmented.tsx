'use client';

import { cn } from '@/lib/utils';

/** 分段控件（状态筛选、模式切换） */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
  size = 'sm',
}: {
  options: Array<{ value: T; label: string; count?: number }>;
  value: T;
  onChange: (v: T) => void;
  className?: string;
  size?: 'sm' | 'md';
}) {
  return (
    <div
      className={cn(
        'inline-flex items-center gap-0.5 rounded-lg border border-[var(--border-soft)] bg-brand-50/60 p-0.5',
        className,
      )}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={cn(
              'inline-flex items-center gap-1 rounded-md font-medium transition-colors',
              size === 'sm' ? 'px-2 py-1 text-[12px]' : 'px-3 py-1.5 text-sm',
              active
                ? 'bg-paper-card text-brand-700 shadow-sm'
                : 'text-ink-500 hover:text-brand-600',
            )}
          >
            {opt.label}
            {opt.count !== undefined && (
              <span
                className={cn(
                  'tabular-nums',
                  active ? 'text-brand-400' : 'text-ink-500/70',
                )}
              >
                {opt.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
