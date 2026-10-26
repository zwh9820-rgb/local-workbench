import JSZip from 'jszip';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { sqlite, DB_PATH } from '@/db';
import { SETTINGS_PATH, readSettings } from '@/server/settings';

/**
 * 导出备份：GET /api/backup/export
 * ----------------------------------------------------------------------------
 * 内容：workbench.db（VACUUM INTO 生成一致性快照）+ settings.json + manifest
 * 说明：不打包 ComfyUI / LM Studio 的任何数据，仅本工作台自身数据。
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-backup-'));
    const snapshot = path.join(tmpDir, 'workbench.db');

    // VACUUM INTO 会在不影响当前连接的前提下生成完整快照
    sqlite.exec(`VACUUM INTO '${snapshot.replace(/'/g, "''")}'`);

    const zip = new JSZip();
    zip.file('workbench.db', fs.readFileSync(snapshot));

    if (fs.existsSync(SETTINGS_PATH)) {
      zip.file('settings.json', fs.readFileSync(SETTINGS_PATH));
    }

    zip.file(
      'manifest.json',
      JSON.stringify(
        {
          app: 'ai-content-workbench',
          version: 1,
          exportedAt: new Date().toISOString(),
          host: os.hostname(),
          dbPath: DB_PATH,
          settings: readSettings(),
        },
        null,
        2,
      ),
    );

    const buffer = await zip.generateAsync({ type: 'nodebuffer' });

    // 清理临时文件
    fs.rmSync(tmpDir, { recursive: true, force: true });

    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');

    return new Response(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="workbench-backup-${stamp}.zip"`,
        'Content-Length': String(buffer.length),
      },
    });
  } catch (err) {
    console.error('[api/backup/export]', err);
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : '导出失败',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
}
