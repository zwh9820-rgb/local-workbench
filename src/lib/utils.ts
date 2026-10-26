/**
 * 通用工具函数（纯函数，无副作用，服务端/客户端均可使用）
 */
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** 合并 className，后者覆盖前者的冲突类 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** 生成 uuid（浏览器 / Node 18+ 均原生支持） */
export function uuid(): string {
  return crypto.randomUUID();
}

/** 本地日期键：YYYY-MM-DD（不使用 UTC，避免时区错位） */
export function dateKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 今天的日期键 */
export function todayKey(): string {
  return dateKey(new Date());
}

/** 本周起止（周一 ~ 周日），返回 [start, end] 的 00:00 与 23:59:59.999 */
export function weekRange(base: Date = new Date()): { start: Date; end: Date } {
  const day = base.getDay(); // 0=周日
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const start = new Date(base);
  start.setDate(base.getDate() + diffToMonday);
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);

  return { start, end };
}

/** 今日起止 */
export function dayRange(base: Date = new Date()): { start: Date; end: Date } {
  const start = new Date(base);
  start.setHours(0, 0, 0, 0);
  const end = new Date(base);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

/** 格式化为 MM-DD HH:mm */
export function formatDateTime(d: Date | number | null | undefined): string {
  if (!d) return '—';
  const date = typeof d === 'number' ? new Date(d) : d;
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mi = String(date.getMinutes()).padStart(2, '0');
  return `${mm}-${dd} ${hh}:${mi}`;
}

/** 相对时间：刚刚 / 3 分钟前 / 2 小时前 / 3 天前 / MM-DD */
export function timeAgo(d: Date | number | null | undefined): string {
  if (!d) return '—';
  const date = typeof d === 'number' ? new Date(d) : d;
  const diff = Date.now() - date.getTime();
  if (diff < 60_000) return '刚刚';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)} 天前`;
  return formatDateTime(date).slice(0, 5);
}

/** 截断文本（按字符数，不破坏代理对） */
export function truncate(s: string, n: number): string {
  if (!s) return '';
  return s.length <= n ? s : `${Array.from(s).slice(0, n).join('')}…`;
}

/** 从 Markdown 中抽取纯文本（列表卡片摘要用） */
export function stripMarkdown(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/!\[[^\]]*]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)]\([^)]*\)/g, '$1')
    .replace(/[#>*_~\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 解析逗号/空格分隔的标签输入 */
export function parseTags(input: string): string[] {
  return Array.from(
    new Set(
      input
        .split(/[,，\s]+/)
        .map((t) => t.trim())
        .filter(Boolean),
    ),
  ).slice(0, 12);
}

/** 限制数值范围 */
export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** 安全 JSON 解析（永不抛错） */
export function safeJsonParse<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** 防抖 */
export function debounce<A extends unknown[]>(
  fn: (...args: A) => void,
  wait = 300,
): (...args: A) => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return (...args: A) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

/** 是否 macOS（快捷键显示用） */
export function isMac(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Mac|iPhone|iPad/.test(navigator.platform);
}
