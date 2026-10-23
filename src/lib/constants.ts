import {
  Bot,
  Braces,
  CalendarDays,
  CalendarRange,
  Flame,
  LayoutDashboard,
  Lightbulb,
  ListTodo,
  NotebookPen,
  type LucideIcon,
} from 'lucide-react';
import type {
  InspirationStatus,
  InspirationType,
  TodoPriority,
  TodoStatus,
} from '@/db/schema';

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  hint?: string;
};

/** 侧边栏导航（顺序即展示顺序） */
export const NAV_ITEMS: NavItem[] = [
  { href: '/', label: '总览', icon: LayoutDashboard },
  { href: '/calendar', label: '日历', icon: CalendarDays },
  { href: '/ai-hot', label: 'AI 热点', icon: Flame },
  { href: '/today-todo', label: '今日待办', icon: ListTodo },
  { href: '/week-task', label: '本周任务', icon: CalendarRange },
  { href: '/review', label: '今日复盘', icon: NotebookPen },
  { href: '/inspiration', label: '灵感素材库', icon: Lightbulb },
  { href: '/prompt-template', label: '提示词模板', icon: Braces },
  { href: '/agent', label: 'AI 助手', icon: Bot, hint: 'Agent' },
];

/* ------------------------------- 灵感状态 -------------------------------- */

export const INSPIRATION_STATUS_LABEL: Record<InspirationStatus, string> = {
  ongoing: '进行中',
  paused: '暂停',
  finished: '已完成',
  abandoned: '已放弃',
};

/** 状态 → 颜色（严格使用 status 色板） */
export const INSPIRATION_STATUS_COLOR: Record<
  InspirationStatus,
  { text: string; bg: string; dot: string }
> = {
  ongoing: { text: 'text-status-active', bg: 'bg-status-active/10', dot: 'bg-status-active' },
  paused: { text: 'text-status-paused', bg: 'bg-status-paused/10', dot: 'bg-status-paused' },
  finished: { text: 'text-status-done', bg: 'bg-status-done/10', dot: 'bg-status-done' },
  abandoned: {
    text: 'text-status-abandoned',
    bg: 'bg-status-abandoned/10',
    dot: 'bg-status-abandoned',
  },
};

export const INSPIRATION_TYPE_LABEL: Record<InspirationType, string> = {
  prompt: '提示词',
  comfyui: 'ComfyUI',
  script: '漫剧脚本',
  video: '短视频',
  note: '笔记',
};

/* --------------------------------- 待办 ---------------------------------- */

export const TODO_STATUS_LABEL: Record<TodoStatus, string> = {
  pending: '待办',
  doing: '进行中',
  done: '已完成',
};

export const TODO_PRIORITY_LABEL: Record<TodoPriority, string> = {
  low: '低',
  medium: '中',
  high: '高',
};

export const TODO_PRIORITY_COLOR: Record<TodoPriority, string> = {
  low: 'text-ink-500',
  medium: 'text-status-active',
  high: 'text-status-abandoned',
};

/* -------------------------------- 剪贴板 --------------------------------- */

export const CLIPBOARD_TYPE_LABEL: Record<string, string> = {
  text: '文本',
  markdown: 'Markdown',
  code: '代码',
  url: '链接',
};

/* -------------------------------- 快捷键 --------------------------------- */

export const HOTKEYS = {
  search: 'Ctrl+K',
  newInspiration: 'Ctrl+N',
  newTodo: 'Ctrl+T',
  review: 'Ctrl+R',
  close: 'Esc',
} as const;

/** 白名单素材目录（相对项目根） */
export const AI_MATERIAL_DIR =
  process.env.NEXT_PUBLIC_AI_MATERIAL_DIR ?? 'public/assets/ai-material';
