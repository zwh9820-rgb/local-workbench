import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * 标准页面滚动容器
 * 应用外壳的 main 是不滚动的，普通页面用这个包一层即可获得
 * 「整页滚动 + 居中最大宽度 + 统一内边距」。
 */
export function PageScroll({
  children,
  className,
  maxWidth = 'max-w-[1180px]',
}: {
  children: ReactNode;
  className?: string;
  maxWidth?: string;
}) {
  return (
    <div className={cn('h-full overflow-y-auto', className)}>
      <div className={cn('mx-auto w-full px-6 py-5', maxWidth)}>{children}</div>
    </div>
  );
}
