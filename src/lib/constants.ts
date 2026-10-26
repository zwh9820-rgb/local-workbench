/**
 * 全局常量：导航、枚举中文标签、节点默认尺寸
 * 说明：所有枚举值必须与 src/db/schema.ts 中的 enum 保持一致。
 */
import {
  CheckSquare,
  Frame,
  LayoutDashboard,
  Lightbulb,
  NotebookPen,
  Settings,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import type { ComfyTaskStatus, NodeType } from '@/db/schema';

/* ------------------------------- 侧边栏导航 ------------------------------- */
export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** 快捷键提示（仅展示） */
  hint?: string;
}

export const NAV_GROUPS: Array<{ title: string; items: NavItem[] }> = [
  {
    title: '工作台',
    items: [
      { href: '/', label: '总览', icon: LayoutDashboard },
      { href: '/todo', label: '待办', icon: CheckSquare, hint: 'Ctrl+T' },
      { href: '/review', label: '复盘', icon: NotebookPen },
      { href: '/inspiration', label: '灵感', icon: Lightbulb, hint: 'Ctrl+N' },
    ],
  },
  {
    title: '生产',
    items: [
      { href: '/canvas', label: '画布', icon: Frame },
      { href: '/agent', label: 'AI 助手', icon: Sparkles },
    ],
  },
];

export const SETTINGS_NAV: NavItem = {
  href: '/settings',
  label: '设置',
  icon: Settings,
};

/* ------------------------------- 枚举标签 -------------------------------- */

export const TODO_STATUS_LABEL = {
  pending: '未完成',
  done: '已完成',
} as const;

export const TODO_PRIORITY_LABEL = {
  low: '低',
  medium: '中',
  high: '高',
} as const;

export const INSPIRATION_STATUS_LABEL = {
  ongoing: '进行中',
  paused: '搁置',
  finished: '已完成',
  abandoned: '已放弃',
} as const;

export const INSPIRATION_TYPE_LABEL = {
  idea: '点子',
  prompt: '提示词',
  script: '脚本',
  fragment: '碎片',
  project: '项目',
  note: '笔记',
} as const;

export const COMFY_STATUS_LABEL: Record<ComfyTaskStatus, string> = {
  idle: '待运行',
  queued: '排队中',
  running: '生成中',
  done: '已完成',
  error: '失败',
};

/** 状态 → 颜色 token（仅状态色允许出现彩色） */
export const COMFY_STATUS_COLOR: Record<ComfyTaskStatus, string> = {
  idle: 'var(--text-muted)',
  queued: 'var(--warning)',
  running: 'var(--warning)',
  done: 'var(--success)',
  error: 'var(--error)',
};

export const NODE_TYPE_LABEL: Record<NodeType, string> = {
  image: '图片',
  prompt: '提示词',
  comfy_run: 'ComfyUI',
  file: '文件',
  group: '分组',
  note: '便签',
  template: '模板',
};

/* ----------------------------- 节点默认尺寸 ------------------------------ */

export const NODE_DEFAULT_SIZE: Record<NodeType, { width: number; height: number }> = {
  image: { width: 320, height: 360 },
  prompt: { width: 340, height: 260 },
  comfy_run: { width: 380, height: 300 },
  file: { width: 280, height: 140 },
  group: { width: 480, height: 360 },
  note: { width: 260, height: 180 },
  template: { width: 320, height: 240 },
};

/* ------------------------------- 其它常量 -------------------------------- */

/** 画布自动保存节流（毫秒） */
export const CANVAS_AUTOSAVE_MS = 800;

/** 画布缩放范围 */
export const CANVAS_ZOOM = { min: 0.2, max: 2.5 };

/** 全局搜索单类结果上限 */
export const SEARCH_LIMIT = 20;

/** 默认 ComfyUI / LM Studio 地址（设置页初始值） */
export const DEFAULT_COMFY_HOST = 'http://127.0.0.1:8188';
export const DEFAULT_LM_STUDIO_HOST = 'http://127.0.0.1:1234/v1';

/** 复盘 Markdown 模板 */
export const REVIEW_TEMPLATE = `## 今日完成
- 

## 遇到的问题
- 

## 明日计划
- 

## 随手记
`;
