'use client';

import { forwardRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

const baseField =
  'w-full rounded-lg border border-[var(--border-strong)] bg-paper-card px-3 text-sm text-ink-900 placeholder:text-ink-500/70 transition-colors hover:border-brand-200 focus:border-brand-400';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...rest }, ref) {
    return <input ref={ref} className={cn(baseField, 'h-9', className)} {...rest} />;
  },
);

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...rest }, ref) {
  return (
    <textarea
      ref={ref}
      className={cn(baseField, 'min-h-[80px] resize-y py-2 leading-6', className)}
      {...rest}
    />
  );
});

export const Select = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement>
>(function Select({ className, children, ...rest }, ref) {
  return (
    <select ref={ref} className={cn(baseField, 'h-9 cursor-pointer pr-8', className)} {...rest}>
      {children}
    </select>
  );
});

/** 表单项容器：标题 + 说明 + 错误 */
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
  error?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      {label && (
        <label className="flex items-center gap-1 text-xs font-medium text-ink-700">
          {label}
          {required && <span className="text-status-abandoned">*</span>}
        </label>
      )}
      {children}
      {error ? (
        <p className="text-[11px] text-status-abandoned">{error}</p>
      ) : (
        hint && <p className="text-[11px] text-ink-500">{hint}</p>
      )}
    </div>
  );
}

/** 开关：用于 Agent 文件读取权限等敏感项 */
export function Switch({
  checked,
  onChange,
  label,
  desc,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: ReactNode;
  desc?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'flex w-full items-start gap-2.5 rounded-lg px-1 py-1 text-left transition-opacity',
        disabled && 'cursor-not-allowed opacity-50',
      )}
    >
      <span
        className={cn(
          'mt-0.5 flex h-4 w-7 shrink-0 items-center rounded-full p-0.5 transition-colors',
          checked ? 'bg-brand-500' : 'bg-ink-300',
        )}
      >
        <span
          className={cn(
            'h-3 w-3 rounded-full bg-white transition-transform',
            checked && 'translate-x-3',
          )}
        />
      </span>
      <span className="min-w-0">
        {label && <span className="block text-xs font-medium text-ink-700">{label}</span>}
        {desc && <span className="mt-0.5 block text-[11px] leading-4 text-ink-500">{desc}</span>}
      </span>
    </button>
  );
}
