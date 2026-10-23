'use client';

import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle';
type Size = 'sm' | 'md' | 'icon';

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
};

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-brand-500 text-white hover:bg-brand-600 active:bg-brand-700 disabled:bg-brand-300',
  secondary:
    'border border-[var(--border-strong)] bg-paper-card text-ink-700 hover:bg-brand-50 hover:text-brand-700',
  ghost: 'text-ink-500 hover:bg-brand-50 hover:text-brand-700',
  subtle: 'bg-brand-50 text-brand-700 hover:bg-brand-100',
  danger:
    'bg-status-abandoned/10 text-status-abandoned hover:bg-status-abandoned/15 border border-status-abandoned/20',
};

const SIZES: Record<Size, string> = {
  sm: 'h-8 px-2.5 text-[13px] gap-1.5',
  md: 'h-9 px-3.5 text-sm gap-2',
  icon: 'h-9 w-9 justify-center',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'secondary', size = 'md', loading, disabled, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex select-none items-center rounded-lg font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300/60',
        'disabled:cursor-not-allowed disabled:opacity-60',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    >
      {loading && (
        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
      )}
      {children}
    </button>
  );
});
