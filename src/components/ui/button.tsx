'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

type Variant = 'primary' | 'ghost' | 'subtle' | 'danger' | 'text';
type Size = 'sm' | 'md' | 'icon' | 'icon-sm';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
}

const VARIANTS: Record<Variant, string> = {
  // 反色实心：页面唯一主操作
  primary:
    'bg-app-inverse text-ink-inverse border border-transparent hover:opacity-90 active:opacity-80',
  // 描边：次要操作
  ghost:
    'bg-transparent text-ink-secondary border border-line hover:bg-app-hover hover:text-ink',
  // 浅底：工具条内
  subtle:
    'bg-app-hover text-ink-secondary border border-transparent hover:text-ink hover:bg-app-active',
  // 危险：仅删除类，文字用 error 色
  danger:
    'bg-transparent text-[var(--error)] border border-line hover:border-[var(--error)] hover:bg-app-hover',
  // 纯文字
  text: 'bg-transparent text-ink-secondary border border-transparent hover:text-ink px-1',
};

const SIZES: Record<Size, string> = {
  sm: 'h-7 px-2 text-xs gap-1',
  md: 'h-8 px-3 text-[13px] gap-1.5',
  icon: 'h-8 w-8 p-0',
  'icon-sm': 'h-7 w-7 p-0',
};

export function Button({
  variant = 'ghost',
  size = 'md',
  loading = false,
  icon,
  className,
  children,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center rounded-md font-medium whitespace-nowrap',
        'transition-colors duration-150 select-none',
        'disabled:opacity-40 disabled:pointer-events-none',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    >
      {loading ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        icon && <span className="shrink-0 [&>svg]:h-3.5 [&>svg]:w-3.5">{icon}</span>
      )}
      {children}
    </button>
  );
}
