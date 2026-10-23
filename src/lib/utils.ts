/** 通用工具函数（无 DOM 强依赖，桌面端可复用） */

/** 轻量 className 合并 */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

/** 生成短 ID */
export function uid(): string {
  return crypto.randomUUID();
}

/** 截断文本 */
export function truncate(text: string | null | undefined, max = 120): string {
  if (!text) return '';
  const plain = text
    .replace(/```[\s\S]*?```/g, ' [代码] ')
    .replace(/[#>*`_\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return plain.length > max ? `${plain.slice(0, max)}…` : plain;
}

/** 标签输入（逗号/空格分隔）→ 数组 */
export function parseTags(input: string): string[] {
  return input
    .split(/[,，\s]+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 20);
}

/** 数组 → 标签输入字符串 */
export function joinTags(tags: string[] | null | undefined): string {
  return (tags ?? []).join(', ');
}

/** 从模板正文中提取 {{变量}} 名称（去重保序） */
export function extractVariables(content: string): string[] {
  const set = new Set<string>();
  const re = /\{\{\s*([\w\u4e00-\u9fa5.-]+)\s*\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content))) set.add(m[1]);
  return [...set];
}

/** 用给定值渲染 {{变量}}，未提供则保留占位 */
export function renderTemplate(
  content: string,
  values: Record<string, string>,
): string {
  return content.replace(/\{\{\s*([\w\u4e00-\u9fa5.-]+)\s*\}\}/g, (raw, name: string) => {
    const v = values[name];
    return v === undefined || v === '' ? raw : v;
  });
}

/** 复制到剪贴板（浏览器环境；桌面端可替换为 tauri clipboard 插件） */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/** 触发浏览器下载（后续 Tauri 可换成 dialog.save） */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** 安全 JSON 解析 */
export function safeJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** 百分比收敛到 0-100 */
export function clampPercent(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.min(100, Math.max(0, Math.round(n)));
}
