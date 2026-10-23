import JSZip from 'jszip';
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, normalize, sep } from 'node:path';
import { sqlite } from '@/db';
import { resolveImportPath } from '@/lib/backup';
import { getMaterialDir } from '@/lib/paths';
import { fail, ok } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 导入备份
 *
 * 支持两种入参：
 *  1. Web：POST multipart/form-data  file=xxx.zip（浏览器 <input type=file>）
 *  2. Tauri：POST application/json  { "path": "<App 数据目录内的 zip 绝对路径>" }
 *     Rust 侧先弹系统「打开」对话框，把用户选中的 zip 复制进 backups/，
 *     再把路径交给这里 —— 这样 Web 端也无法构造任意路径读系统文件。
 *
 * 实现要点：不覆盖正在打开的 db 文件（better-sqlite3 持有句柄），
 * 而是 ATTACH 备份库后逐表覆盖写入，全程一个事务，失败自动回滚。
 */
export async function POST(req: Request) {
  try {
    const contentType = req.headers.get('content-type') ?? '';
    let buffer: Buffer;

    if (contentType.includes('application/json')) {
      const body = (await req.json()) as { path?: string };
      if (!body.path) return fail('缺少备份文件路径', 400);
      const abs = resolveImportPath(body.path);
      buffer = readFileSync(abs);
    } else {
      const form = await req.formData();
      const file = form.get('file');
      if (!(file instanceof File)) return fail('请选择 zip 备份文件', 400);
      if (file.size > 200 * 1024 * 1024) return fail('备份文件过大（>200MB）', 400);
      buffer = Buffer.from(await file.arrayBuffer());
    }

    const zip = await JSZip.loadAsync(buffer);
    const dbEntry = zip.file('workbench.db');
    if (!dbEntry) return fail('备份包内缺少 workbench.db', 400);

    // 1) 备份库落到临时文件
    const tmpPath = join(tmpdir(), `wb-import-${Date.now()}.db`);
    writeFileSync(tmpPath, Buffer.from(await dbEntry.async('nodebuffer')));

    // 2) ATTACH + 逐表覆盖
    const escaped = tmpPath.replace(/'/g, "''");
    sqlite.exec(`ATTACH DATABASE '${escaped}' AS backup`);

    const backupTables = sqlite
      .prepare(
        `SELECT name FROM backup.sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle%'`,
      )
      .all() as { name: string }[];

    const mainTables = new Set(
      (
        sqlite.prepare(`SELECT name FROM main.sqlite_master WHERE type='table'`).all() as {
          name: string;
        }[]
      ).map((t) => t.name),
    );

    const imported: Record<string, number> = {};
    sqlite.pragma('foreign_keys = OFF');
    try {
      const run = sqlite.transaction(() => {
        for (const t of backupTables) {
          if (!mainTables.has(t.name)) continue;
          sqlite.exec(`DELETE FROM main."${t.name}"`);
          sqlite.exec(`INSERT INTO main."${t.name}" SELECT * FROM backup."${t.name}"`);
          const row = sqlite
            .prepare(`SELECT count(*) as c FROM main."${t.name}"`)
            .get() as { c: number };
          imported[t.name] = row.c;
        }
      });
      run();
    } finally {
      sqlite.pragma('foreign_keys = ON');
      sqlite.exec('DETACH DATABASE backup');
      try {
        unlinkSync(tmpPath);
      } catch {
        /* ignore */
      }
    }

    // 3) 恢复素材目录（Tauri 模式下目标是 %APPDATA%/.../ai-material）
    const materialDir = getMaterialDir();
    let materialFiles = 0;
    const entries = Object.keys(zip.files).filter(
      (name) => name.startsWith('ai-material/') && !zip.files[name].dir,
    );
    for (const name of entries) {
      const rel = name.slice('ai-material/'.length);
      // 防目录穿越
      const target = normalize(join(materialDir, rel));
      if (!target.startsWith(normalize(materialDir) + sep)) continue;
      const data = await zip.files[name].async('nodebuffer');
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, data);
      materialFiles += 1;
    }

    return ok({ imported, materialFiles, materialDir });
  } catch (err) {
    console.error('[backup/import]', err);
    return fail('导入失败：' + (err instanceof Error ? err.message : '未知错误'), 500);
  }
}
