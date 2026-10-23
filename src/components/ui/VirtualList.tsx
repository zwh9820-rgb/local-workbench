'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * 轻量虚拟滚动（定高行）。
 *
 * 为什么不用 react-window？
 * 依赖越少越好迁移 Tauri，而且这里只需要「定高行窗口化」这一种能力。
 * 灵感库、会话列表、剪贴板历史都用它，上千条也不卡。
 */
export function VirtualList<T>({
  items,
  itemHeight,
  renderItem,
  className,
  overscan = 6,
  empty,
}: {
  items: T[];
  itemHeight: number;
  renderItem: (item: T, index: number) => ReactNode;
  className?: string;
  overscan?: number;
  empty?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewport, setViewport] = useState(0);

  // 监听容器高度变化
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setViewport(el.clientHeight);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (items.length === 0) return <>{empty ?? null}</>;

  const total = items.length * itemHeight;
  const start = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
  const end = Math.min(
    items.length,
    Math.ceil((scrollTop + (viewport || itemHeight * 8)) / itemHeight) + overscan,
  );
  const slice = items.slice(start, end);

  return (
    <div
      ref={ref}
      onScroll={(e) => setScrollTop((e.target as HTMLDivElement).scrollTop)}
      className={cn('overflow-y-auto', className)}
    >
      <div style={{ height: total, position: 'relative' }}>
        {slice.map((item, i) => {
          const index = start + i;
          return (
            <div
              key={index}
              style={{
                position: 'absolute',
                top: index * itemHeight,
                left: 0,
                right: 0,
                height: itemHeight,
              }}
            >
              {renderItem(item, index)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
