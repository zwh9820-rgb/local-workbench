'use client';

import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';
import { cn } from '@/lib/utils';

const BASE =
  'w-full rounded-md border border-line bg-app text-[13px] text-ink placeholder:text-ink-muted ' +
  'transition-colors focus:border-line-strong focus:outline-none disabled:opacity-50';

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(BASE, 'h-8 px-2.5', className)} {...rest} />;
}

export function Textarea({
  className,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(BASE, 'min-h-[80px] resize-y px-2.5 py-2 leading-6', className)}
      {...rest}
    />
  );
}

export function Select({
  className,
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        BASE,
        'h-8 cursor-pointer appearance-none bg-[length:10px] bg-[right_8px_center] bg-no-repeat px-2.5 pr-7',
        className,
      )}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'><path d='M1 1l4 4 4-4' fill='none' stroke='%23999' stroke-width='1.4' stroke-linecap='round'/></svg>\")",
      }}
      {...rest}
    >
      {children}
    </select>
  );
}

/** 表单行：标签 + 控件 + 说明 */
export function Field({
  label,
  hint,
  error,
  required,
  children,
  className,
}: {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      {label && (
        <label className="flex items-center gap-1 text-xs font-medium text-ink-secondary">
          {label}
          {required && <span className="text-[var(--error)]">*</span>}
        </label>
      )}
      {children}
      {error ? (
        <p className="text-2xs text-[var(--error)]">{error}</p>
      ) : (
        hint && <p className="text-2xs text-ink-muted">{hint}</p>
      )}
    </div>
  );
}

/** 搜索输入框（带图标 + 清除） */
export function SearchInput({
  value,
  onChange,
  placeholder = '搜索…',
  className,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
}) {
  return (
    <div className={cn('relative', className)}>
      <svg
        className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-muted"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <circle cx="7" cy="7" r="4.5" />
        <path d="M10.5 10.5L14 14" strokeLinecap="round" />
      </svg>
      <input
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(BASE, 'h-8 pl-8 pr-2.5', className)}
      />
    </div>
  );
}
