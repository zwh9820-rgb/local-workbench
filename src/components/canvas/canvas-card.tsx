'use client';

import Link from 'next/link';
import { Frame, LayoutTemplate } from 'lucide-react';
import type { CanvasListItem } from '@/db/schema';
import { cn, timeAgo, truncate } from '@/lib/utils';

/** 画布封面占位：黑白点阵，避免空卡片过于单调 */
const DOT_BG: React.CSSProperties = {
  backgroundImage:
    'radial-gradient(circle at 1px 1px, var(--canvas-dot) 1px, transparent 0)',
  backgroundSize: '12px 12px',
};

export function CanvasCard({
  canvas,
  className,
}: {
  canvas: CanvasListItem;
  className?: string;
}) {
  return (
    <Link
      href={`/canvas/${canvas.id}`}
      className={cn(
        'group flex flex-col overflow-hidden rounded-md border border-line bg-app-panel transition-colors hover:border-line-strong',
        className,
      )}
    >
      {/* 封面 */}
      <div
        className="relative aspect-[4/3] w-full overflow-hidden border-b border-line bg-app-hover"
        style={canvas.coverImage ? undefined : DOT_BG}
      >
        {canvas.coverImage ? (
          // 本地图片直出，不走 next/image 优化（离线可用）
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={canvas.coverImage}
            alt={canvas.name}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Frame className="h-6 w-6 text-ink-muted/60" strokeWidth={1.25} />
          </div>
        )}

        {canvas.isTemplate && (
          <span className="absolute right-1.5 top-1.5 inline-flex items-center gap-1 rounded-sm border border-line bg-app px-1.5 py-0.5 text-[10px] text-ink-secondary">
            <LayoutTemplate className="h-2.5 w-2.5" />
            模板
          </span>
        )}
      </div>

      {/* 信息 */}
      <div className="px-2.5 py-2">
        <div className="truncate text-[13px] font-medium text-ink">{canvas.name}</div>
        <div className="mt-0.5 flex items-center gap-1.5 text-2xs text-ink-muted">
          <span>{canvas.nodeCount} 个节点</span>
          <span className="text-line-strong">·</span>
          <span>{timeAgo(canvas.updatedAt)}</span>
        </div>
        {canvas.description && (
          <div className="mt-1 truncate text-2xs text-ink-muted">
            {truncate(canvas.description, 40)}
          </div>
        )}
      </div>
    </Link>
  );
}
