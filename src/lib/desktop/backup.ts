import { api } from '@/lib/api';
import { downloadBlob } from '@/lib/utils';
import { invokeCmd, isTauri, pickFileInBrowser } from './index';

/**
 * 备份导出 / 导入（Web 与 Tauri 双通道）
 *
 * Web：
 *   GET  /api/backup/export  → 二进制 zip → 浏览器下载
 *   导入用 <input type=file> + multipart 上传
 *
 * Tauri：
 *   POST /api/backup/export  → 服务端写入 %APPDATA%/.../backups/，返回路径
 *   → Rust save_backup_as() 弹系统「另存为」，把文件复制到用户选择位置
 *   导入 → Rust pick_backup_to_import() 弹「打开」，把 zip 复制进 backups/
 *   → POST /api/backup/import { path } 让服务端按路径导入（不经过 JS 传大文件）
 *
 * 这样前端逻辑只有一份，两端的差异全部收敛在本文件。
 */

export type ExportResult = {
  /** 用户在「另存为」里选的位置（取消则 undefined） */
  savedTo?: string;
  /** 应用数据目录内的固定副本 */
  inAppDir: string;
  size: number;
  cancelled?: boolean;
};

/** 导出备份 */
export async function exportBackup(): Promise<ExportResult> {
  if (isTauri()) {
    const res = await api.post<{ path: string; name: string; size: number }>(
      '/api/backup/export',
    );

    const dest = await invokeCmd<string | null>('save_backup_as', {
      source: res.path,
      suggested: res.name,
    });

    return {
      savedTo: dest ?? undefined,
      inAppDir: res.path,
      size: res.size,
      cancelled: !dest,
    };
  }

  // Web：直接下载
  const response = await fetch('/api/backup/export');
  if (!response.ok) throw new Error(`导出失败 (${response.status})`);
  const blob = await response.blob();
  downloadBlob(blob, `workbench-backup-${new Date().toISOString().slice(0, 10)}.zip`);
  return { inAppDir: '', size: blob.size };
}

export type ImportResult = {
  imported: Record<string, number>;
  materialFiles: number;
};

/** 导入备份；用户取消返回 null */
export async function importBackup(): Promise<ImportResult | null> {
  if (isTauri()) {
    // Rust 弹系统「打开」对话框，并把选中的 zip 复制进 App 数据目录
    const path = await invokeCmd<string | null>('pick_backup_to_import');
    if (!path) return null;
    return api.post<ImportResult>('/api/backup/import', { path });
  }

  const file = await pickFileInBrowser('.zip');
  if (!file) return null;

  const form = new FormData();
  form.append('file', file);
  const response = await fetch('/api/backup/import', { method: 'POST', body: form });
  const payload = (await response.json()) as
    | { ok: true; data: ImportResult }
    | { ok: false; error: string };
  if (!response.ok || !payload.ok) {
    throw new Error(payload.ok ? '导入失败' : payload.error);
  }
  return payload.data;
}
