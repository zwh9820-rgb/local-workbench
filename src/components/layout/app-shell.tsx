'use client';

import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useUIStore } from '@/store/ui';
import { Sidebar } from './sidebar';
import { Topbar } from './topbar';
import { GlobalSearch } from './global-search';
import { ThemeEffect } from './theme-toggle';

/** 判断事件是否发生在可编辑元素内（此时不劫持单键快捷键） */
function isEditingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    el.isContentEditable
  );
}

/**
 * 应用外壳：左侧栏 + 顶栏 + 主内容区
 * 快捷键：
 *   Ctrl/⌘ + K  全局搜索（任何场景都可唤起）
 *   Ctrl/⌘ + N  新建灵感
 *   Ctrl/⌘ + T  新建待办
 *   Esc         关闭弹层（各弹层内部处理）
 */
export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const toggleSearch = useUIStore((s) => s.toggleSearch);
  const closeSearch = useUIStore((s) => s.closeSearch);
  const searchOpen = useUIStore((s) => s.searchOpen);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) {
        if (e.key === 'Escape' && searchOpen) closeSearch();
        return;
      }

      const key = e.key.toLowerCase();

      // Ctrl+K：全局搜索，优先级最高
      if (key === 'k') {
        e.preventDefault();
        toggleSearch();
        return;
      }

      if (isEditingTarget(e.target)) return;

      // Ctrl+N：新建灵感
      if (key === 'n') {
        e.preventDefault();
        router.push('/inspiration?new=1');
        return;
      }

      // Ctrl+T：新建待办
      if (key === 't') {
        e.preventDefault();
        router.push('/todo?new=1');
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [router, toggleSearch, closeSearch, searchOpen]);

  return (
    <div className="flex h-dvh overflow-hidden bg-app">
      <Sidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        {/* 主内容区自身不滚动，由各页面决定滚动策略（画布页需要占满） */}
        <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
      </div>

      <GlobalSearch />
      <ThemeEffect />
    </div>
  );
}
