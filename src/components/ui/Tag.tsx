'use client';

import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** 标签：低饱和，仅用 brand 色阶 */
export function Tag({
  children,
  onRemove,
  onClick,
  active,
  className,
}: {
  children: ReactNode;
  onRemove?: () => void;
  onClick?: () => void;
  active?: boolean;
  className?: string;
}) {
  const Comp = onClick ? 'button' : 'span';
  return (
    <Comp
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] transition-colors',
        active
          ? 'bg-brand-500 text-white'
          : 'bg-brand-50 text-brand-600 hover:bg-brand-100',
        className,
      )}
    >
      {children}
      {onRemove && (
        <X
          size={10}
          className="cursor-pointer opacity-60 hover:opacity-100"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
        />
      )}
    </Comp>
  );
}

export function TagList({
  tags,
  max = 4,
  onClick,
  activeTag,
}: {
  tags: string[] | null | undefined;
  max?: number;
  onClick?: (tag: string) => void;
  activeTag?: string;
}) {
  const list = tags ?? [];
  if (list.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1">
      {list.slice(0, max).map((t) => (
        <Tag
          key={t}
          onClick={onClick ? () => onClick(t) : undefined}
          active={activeTag === t}
        >
          #{t}
        </Tag>
      ))}
      {list.length > max && (
        <span className="text-[11px] text-ink-500">+{list.length - max}</span>
      )}
    </div>
  );
}
