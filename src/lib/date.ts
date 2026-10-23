/**
 * 日期工具（纯函数，无浏览器依赖，桌面端可复用）
 * 全部使用「本地时区」，避免跨时区导致的今日/本周错位。
 */

const pad = (n: number) => String(n).padStart(2, '0');

/** Date → 'YYYY-MM-DD'（本地时区） */
export function toDateKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 'YYYY-MM-DD' → Date（本地 00:00:00） */
export function fromDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function todayKey(): string {
  return toDateKey(new Date());
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

export function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

/** 本周一 00:00（周一为一周起点） */
export function startOfWeek(d: Date = new Date()): Date {
  const date = startOfDay(d);
  const day = date.getDay(); // 0=周日
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return date;
}

/** 本周日 23:59 */
export function endOfWeek(d: Date = new Date()): Date {
  const s = startOfWeek(d);
  const e = new Date(s);
  e.setDate(e.getDate() + 6);
  return endOfDay(e);
}

/** ISO 周标识：'2026-W43' */
export function getWeekKey(d: Date = new Date()): string {
  const target = startOfDay(d);
  const dayNum = (target.getDay() + 6) % 7; // 周一=0
  // 该周的周四决定归属年份
  const thursday = new Date(target);
  thursday.setDate(target.getDate() - dayNum + 3);
  const year = thursday.getFullYear();
  const jan1 = new Date(year, 0, 1);
  const week = Math.floor(
    ((thursday.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7,
  );
  return `${year}-W${pad(week)}`;
}

/** 本周 7 天日期键 */
export function weekDayKeys(d: Date = new Date()): string[] {
  const start = startOfWeek(d);
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(start);
    day.setDate(start.getDate() + i);
    return toDateKey(day);
  });
}

/** 月历网格：6 行 x 7 列，含上月/下月补位 */
export function monthMatrix(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7; // 周一为第一列
  const start = new Date(first);
  start.setDate(1 - offset);
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

const WEEK_LABEL = ['一', '二', '三', '四', '五', '六', '日'];

export function weekdayLabel(d: Date): string {
  return WEEK_LABEL[(d.getDay() + 6) % 7];
}

/** '10-22 18:30' */
export function formatDateTime(input: Date | number | null | undefined): string {
  if (!input) return '';
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return '';
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(
    d.getMinutes(),
  )}`;
}

/** '18:30' */
export function formatTime(input: Date | number | null | undefined): string {
  if (!input) return '';
  const d = new Date(input);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 相对时间：刚刚 / 3 分钟前 / 2 小时前 / 昨天 / 10-20 */
export function relativeTime(input: Date | number | string | null | undefined): string {
  if (!input) return '';
  const d = new Date(input);
  const diff = Date.now() - d.getTime();
  if (Number.isNaN(diff)) return '';
  const min = Math.floor(diff / 60000);
  if (min < 1) return '刚刚';
  if (min < 60) return `${min} 分钟前`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour} 小时前`;
  const day = Math.floor(hour / 24);
  if (day === 1) return '昨天';
  if (day < 7) return `${day} 天前`;
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 今天是否在 [start, end] 内 */
export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** 某日期所在月份的中文标题 */
export function monthTitle(year: number, month: number): string {
  return `${year} 年 ${month + 1} 月`;
}
