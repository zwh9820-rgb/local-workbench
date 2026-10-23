'use client';

import { create } from 'zustand';

/** 全局 UI 状态（弹窗、面板、跨组件草稿） */
type QuickCreate = 'inspiration' | 'todo' | 'event' | null;

type UiState = {
  /** 全局搜索弹窗 */
  searchOpen: boolean;
  setSearchOpen: (v: boolean) => void;
  toggleSearch: () => void;

  /** 侧边栏折叠（窄屏自动） */
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;

  /** 全局快捷键触发的新建意图，由对应页面消费 */
  quickCreate: QuickCreate;
  requestQuickCreate: (t: QuickCreate) => void;
  consumeQuickCreate: () => void;

  /** 剪贴板抽屉 */
  clipboardOpen: boolean;
  setClipboardOpen: (v: boolean) => void;

  /** 右键「发送给 Agent」的选中文本 */
  agentDraft: { text: string; nonce: number } | null;
  sendSelectionToAgent: (text: string) => void;
  clearAgentDraft: () => void;

  /** Agent 面板当前会话（跨页面保持） */
  activeSessionId: string | null;
  setActiveSessionId: (id: string | null) => void;
};

export const useUiStore = create<UiState>((set) => ({
  searchOpen: false,
  setSearchOpen: (v) => set({ searchOpen: v }),
  toggleSearch: () => set((s) => ({ searchOpen: !s.searchOpen })),

  sidebarCollapsed: false,
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

  quickCreate: null,
  requestQuickCreate: (t) => set({ quickCreate: t }),
  consumeQuickCreate: () => set({ quickCreate: null }),

  clipboardOpen: false,
  setClipboardOpen: (v) => set({ clipboardOpen: v }),

  agentDraft: null,
  sendSelectionToAgent: (text) =>
    set({ agentDraft: { text, nonce: Date.now() } }),
  clearAgentDraft: () => set({ agentDraft: null }),

  activeSessionId: null,
  setActiveSessionId: (id) => set({ activeSessionId: id }),
}));
