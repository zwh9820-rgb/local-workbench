'use client';

import { X } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Button } from './Button';

const SIZE: Record<'sm' | 'md' | 'lg' | 'xl', string> = {
  sm: 'max-w-md',
  md: 'max-w-xl',
  lg: 'max-w-3xl',
  xl: 'max-w-5xl',
};

/**
 * 通用弹窗。
 * Esc 关闭、点遮罩关闭、打开时锁定 body 滚动。
 * 不使用 portal，避免 SSR 期间 document 不存在的问题。
 */
export function Modal({
  open,
  onClose,
  title,
  desc,
  children,
  footer,
  size = 'md',
  bodyClassName,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  desc?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: keyof typeof SIZE;
  bodyClassName?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-8">
      <div
        className="fixed inset-0 bg-brand-900/30 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          'relative z-10 my-auto w-full animate-slide-up rounded-xl border border-[var(--border-soft)] bg-paper-card shadow-float',
          SIZE[size],
        )}
      >
        {(title || desc) && (
          <div className="flex items-start justify-between gap-4 border-b border-[var(--border-soft)] px-5 py-3.5">
            <div className="min-w-0">
              {title && <h2 className="text-sm font-semibold text-ink-900">{title}</h2>}
              {desc && <p className="mt-1 text-xs text-ink-500">{desc}</p>}
            </div>
            <button
              onClick={onClose}
              className="-mr-1 -mt-0.5 rounded-md p-1 text-ink-500 transition-colors hover:bg-brand-50 hover:text-brand-700"
              aria-label="关闭"
            >
              <X size={16} />
            </button>
          </div>
        )}
        <div className={cn('px-5 py-4', bodyClassName)}>{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-2 border-t border-[var(--border-soft)] px-5 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

/** 二次确认弹窗 */
export function ConfirmDialog({
  open,
  title = '确认操作',
  desc,
  confirmText = '确认',
  danger,
  onConfirm,
  onClose,
  loading,
}: {
  open: boolean;
  title?: string;
  desc?: ReactNode;
  confirmText?: string;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
  loading?: boolean;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button size="sm" variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button
            size="sm"
            variant={danger ? 'danger' : 'primary'}
            onClick={onConfirm}
            loading={loading}
          >
            {confirmText}
          </Button>
        </>
      }
    >
      <p className="text-sm leading-6 text-ink-700">{desc}</p>
    </Modal>
  );
}
