'use client';

/**
 * 全局 UI 状态（Zustand）
 * ----------------------------------------------------------------------------
 * 只放「跨页面共享的界面状态」，业务数据一律走数据库，不在这里做缓存。
 *  - theme            明暗模式（light / dark / system）
 *  - searchOpen       全局搜索面板（Ctrl+K）
 *  - sidebarCollapsed 侧边栏收起
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemeMode = 'light' | 'dark' | 'system';

interface UIState {
  theme: ThemeMode;
  setTheme: (t: ThemeMode) => void;

  searchOpen: boolean;
  openSearch: () => void;
  closeSearch: () => void;
  toggleSearch: () => void;

  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      theme: 'system',
      setTheme: (theme) => set({ theme }),

      searchOpen: false,
      openSearch: () => set({ searchOpen: true }),
      closeSearch: () => set({ searchOpen: false }),
      toggleSearch: () => set((s) => ({ searchOpen: !s.searchOpen })),

      sidebarCollapsed: false,
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
    }),
    {
      name: 'workbench-ui',
      // 只持久化主题与侧边栏折叠，弹窗状态不落盘
      partialize: (s) => ({
        theme: s.theme,
        sidebarCollapsed: s.sidebarCollapsed,
      }),
    },
  ),
);

/** 解析实际生效的明暗（system 时读系统偏好） */
export function resolveTheme(mode: ThemeMode): 'light' | 'dark' {
  if (mode !== 'system') return mode;
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** 把主题写到 <html>，同时同步 Markdown 编辑器的 color-mode */
export function applyTheme(mode: ThemeMode): void {
  if (typeof document === 'undefined') return;
  const resolved = resolveTheme(mode);
  const root = document.documentElement;
  root.classList.toggle('dark', resolved === 'dark');
  root.style.colorScheme = resolved;
  // @uiw/react-md-editor 依赖 data-color-mode 切换自身配色
  root.setAttribute('data-color-mode', resolved);
}
