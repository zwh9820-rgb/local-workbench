/**
 * 桌面能力桥接层
 *
 * 设计原则：
 * - 组件里永远只 import 这一层，不直接 import @tauri-apps/*
 * - 所有能力都做 Web 降级，保证 `npm run dev` 在浏览器里照样能用
 * - Tauri 判定用 __TAURI_INTERNALS__（v2 注入），而不是 UA
 */

/** 是否运行在 Tauri 窗口里 */
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/** 是否运行在浏览器（含 Tauri 的 dev 浏览器调试） */
export function isWeb(): boolean {
  return !isTauri();
}

/**
 * 调用 Rust 命令。
 * 动态 import，浏览器环境下不会加载 Tauri API，也不会因为缺少插件报错。
 */
export async function invokeCmd<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri()) {
    throw new Error(`桌面命令 ${cmd} 仅在 Tauri 窗口中可用`);
  }
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(cmd, args);
}

/** 应用信息（数据目录、数据库路径、版本号） */
export type AppInfo = {
  version: string;
  dataDir: string;
  dbFile: string;
  materialDir: string;
  backupDir: string;
  /** 内置服务日志：%APPDATA%\com.local.workbench\logs\server.log */
  logFile: string;
  serverUrl: string;
  isDev: boolean;
};

export async function getAppInfo(): Promise<AppInfo | null> {
  if (!isTauri()) return null;
  try {
    return await invokeCmd<AppInfo>('app_info');
  } catch {
    return null;
  }
}

/** 用系统默认程序打开外部链接（避免在应用窗口里导航走丢） */
export async function openExternal(url: string): Promise<void> {
  if (!/^https?:\/\//i.test(url)) return;
  if (isTauri()) {
    try {
      await invokeCmd('open_external', { url });
      return;
    } catch {
      /* 降级到 window.open */
    }
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}

/** 在资源管理器里打开数据目录 */
export async function revealDataDir(): Promise<void> {
  if (!isTauri()) return;
  try {
    await invokeCmd('reveal_data_dir');
  } catch {
    /* 忽略 */
  }
}

/**
 * 浏览器端文件选择（Web 降级用）。
 * 返回 File 或 null（用户取消）。
 */
export function pickFileInBrowser(accept = '.zip'): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.display = 'none';
    input.onchange = () => {
      resolve(input.files?.[0] ?? null);
      input.remove();
    };
    // 用户取消时不会触发 change，靠窗口重新聚焦兜底
    const onFocus = () => {
      setTimeout(() => {
        if (!input.files?.length) resolve(null);
        input.remove();
        window.removeEventListener('focus', onFocus);
      }, 500);
    };
    window.addEventListener('focus', onFocus, { once: true });
    document.body.appendChild(input);
    input.click();
  });
}

/** 阻止 Tauri 窗口内的默认右键菜单（由应用自己的菜单接管） */
export function installDesktopContextMenuGuard(): () => void {
  if (!isTauri()) return () => {};
  const handler = (e: MouseEvent) => {
    // 输入框保留原生菜单（复制/粘贴/拼写检查）
    const el = e.target as HTMLElement | null;
    if (el && /^(INPUT|TEXTAREA)$/.test(el.tagName)) return;
    if (el?.isContentEditable) return;
    e.preventDefault();
  };
  document.addEventListener('contextmenu', handler);
  return () => document.removeEventListener('contextmenu', handler);
}
