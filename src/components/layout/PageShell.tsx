import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** 普通页面外壳：撑满 + 自身滚动 */
export function PageShell({
  children,
  className,
  wide,
}: {
  children: ReactNode;
  className?: string;
  wide?: boolean;
}) {
  return (
    <div className="h-full overflow-y-auto">
      <div
        className={cn(
          'mx-auto w-full px-5 py-5',
          wide ? 'max-w-[1500px]' : 'max-w-[1240px]',
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}

/** 页面标题行 */
export function PageHeader({
  title,
  desc,
  actions,
}: {
  title: ReactNode;
  desc?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-lg font-semibold tracking-tight text-ink-900">{title}</h1>
        {desc && <p className="mt-1 text-xs text-ink-500">{desc}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
