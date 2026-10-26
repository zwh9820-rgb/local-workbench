'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './button';

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  /** sm=400 / md=520 / lg=720 / xl=920 */
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** 点击遮罩是否关闭（表单场景建议 false） */
  closeOnBackdrop?: boolean;
  className?: string;
}

const SIZES = {
  sm: 'max-w-[400px]',
  md: 'max-w-[520px]',
  lg: 'max-w-[720px]',
  xl: 'max-w-[920px]',
} as const;

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  closeOnBackdrop = true,
  className,
}: DialogProps) {
  const [mounted, setMounted] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // SSR 安全：仅在挂载后才 portal
  useEffect(() => setMounted(true), []);

  // Esc 关闭 + 锁滚动
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

  // 打开时把焦点移入面板
  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  if (!mounted || !open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 sm:p-6">
      {/* 遮罩 */}
      <div
        className="absolute inset-0 bg-black/40 animate-fade-in"
        onClick={closeOnBackdrop ? onClose : undefined}
        aria-hidden
      />
      {/* 面板 */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className={cn(
          'relative z-10 mt-[8vh] w-full rounded-lg border border-line bg-app shadow-float',
          'animate-scale-in focus:outline-none',
          SIZES[size],
          className,
        )}
      >
        {(title || description) && (
          <header className="flex items-start justify-between gap-4 border-b border-line px-4 py-3">
            <div className="min-w-0">
              {title && (
                <h2 className="truncate text-[13px] font-semibold text-ink">{title}</h2>
              )}
              {description && (
                <p className="mt-0.5 text-xs leading-5 text-ink-secondary">{description}</p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="关闭"
              className="shrink-0 rounded-sm p-1 text-ink-muted transition-colors hover:bg-app-hover hover:text-ink"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </header>
        )}

        <div className="max-h-[70vh] overflow-y-auto px-4 py-3">{children}</div>

        {footer && (
          <footer className="flex items-center justify-end gap-2 border-t border-line px-4 py-2.5">
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body,
  );
}

/* -------------------------------------------------------------------------- */
/*  确认弹窗：删除等危险操作统一走这里                                          */
/* -------------------------------------------------------------------------- */
export interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  message?: ReactNode;
  confirmText?: string;
  danger?: boolean;
  loading?: boolean;
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = '确认',
  danger = false,
  loading = false,
}: ConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      closeOnBackdrop={!loading}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={loading}>
            取消
          </Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            size="sm"
            onClick={() => void onConfirm()}
            loading={loading}
          >
            {confirmText}
          </Button>
        </>
      }
    >
      <div className="text-[13px] leading-6 text-ink-secondary">{message}</div>
    </Dialog>
  );
}
