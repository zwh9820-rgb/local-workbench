import { NextResponse } from 'next/server';
import { backupFileName, buildBackupZip, saveBackupToAppDir } from '@/lib/backup';
import { fail, ok } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 一键导出备份
 *
 * GET  → 返回二进制 zip（Web 端用，浏览器直接下载）
 * POST → 打包后写入 App 数据目录 backups/，返回路径（Tauri 端用，
 *        前端拿到路径后再调用 Rust 的「另存为」对话框把文件复制到用户选择的位置）
 *
 * 两种方式共用 buildBackupZip()，内容完全一致。
 */
export async function GET() {
  try {
    const { buffer } = await buildBackupZip();
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${backupFileName()}"`,
      },
    });
  } catch (err) {
    console.error('[backup/export]', err);
    return fail('导出失败：' + (err instanceof Error ? err.message : '未知错误'), 500);
  }
}

export async function POST() {
  try {
    const { buffer, meta } = await buildBackupZip();
    const saved = saveBackupToAppDir(buffer);
    return ok({ ...saved, meta });
  } catch (err) {
    console.error('[backup/export:post]', err);
    return fail('导出失败：' + (err instanceof Error ? err.message : '未知错误'), 500);
  }
}
