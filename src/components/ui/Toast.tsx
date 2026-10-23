'use client';

import { create } from 'zustand';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { cn } from '@/lib/utils';

type ToastKind = 'success' | 'error' | 'info';
type ToastItem = { id: string; kind: ToastKind; message: string };

type ToastState = {
  items: ToastItem[];
  push: (kind: ToastKind, message: string) => void;
  remove: (id: string) => void;
};

/** 全局轻提示（zustand，无第三方依赖） */
export const useToastStore = create<ToastState>((set) => ({
  items: [],
  push: (kind, message) => {
    const id = crypto.randomUUID();
    set((s) => ({ items: [...s.items, { id, kind, message }] }));
    setTimeout(() => {
      set((s) => ({ items: s.items.filter((i) => i.id !== id) }));
    }, 3200);
  },
  remove: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
}));

/** 命令式调用：toast.success('已保存') */
export const toast = {
  success: (m: string) => useToastStore.getState().push('success', m),
  error: (m: string) => useToastStore.getState().push('error', m),
  info: (m: string) => useToastStore.getState().push('info', m),
};

const ICON = {
  success: <CheckCircle2 size={14} className="text-status-done" />,
  error: <AlertCircle size={14} className="text-status-abandoned" />,
  info: <Info size={14} className="text-status-active" />,
};

export function Toaster() {
  const items = useToastStore((s) => s.items);
  const remove = useToastStore((s) => s.remove);

  if (items.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-[60] flex w-72 flex-col gap-2">
      {items.map((t) => (
        <div
          key={t.id}
          className={cn(
            'pointer-events-auto flex animate-fade-in items-start gap-2 rounded-lg border border-[var(--border-soft)] bg-paper-card px-3 py-2.5 shadow-float',
          )}
        >
          <span className="mt-0.5">{ICON[t.kind]}</span>
          <p className="flex-1 text-xs leading-5 text-ink-700">{t.message}</p>
          <button
            onClick={() => remove(t.id)}
            className="mt-0.5 text-ink-500 transition-colors hover:text-ink-900"
          >
            <X size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}
