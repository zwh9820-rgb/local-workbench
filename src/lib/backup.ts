import JSZip from 'jszip';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { sqlite } from '@/db';
import { getBackupDir, getMaterialDir, isInsideDataRoot } from '@/lib/paths';

/**
 * 备份逻辑（Web / Tauri 共用）
 *
 * 抽出独立模块的原因：
 * - Web 端 GET /api/backup/export 直接返回二进制流
 * - Tauri 端 POST /api/backup/export 先落盘到 App 数据目录 backups/，
 *   再由 Rust 弹系统「另存为」对话框把文件复制到用户选择的位置
 * 两条路径共用同一套打包逻辑，避免行为漂移。
 */

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 单文件 10MB 上限

export type BackupMeta = {
  app: string;
  version: number;
  exportedAt: string;
  dbFile: string;
  materialDir: string;
  materialIncluded: number;
  materialSkipped: number;
  counts: Record<string, number>;
};

/** 递归收集素材目录文件 */
function walk(dir: string, acc: string[] = []): string[] {
  let entries: string[] = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return acc;
  }
  for (const name of entries) {
    const full = join(dir, name);
    try {
      const st = statSync(full);
      if (st.isDirectory()) walk(full, acc);
      else acc.push(full);
    } catch {
      // 跳过无法读取的文件
    }
  }
  return acc;
}

/** 打包：SQLite 快照 + 素材目录 + meta.json */
export async function buildBackupZip(): Promise<{
  buffer: Buffer;
  meta: BackupMeta;
}> {
  // 把 WAL 落盘，保证导出的 db 文件是完整快照
  sqlite.pragma('wal_checkpoint(TRUNCATE)');

  const zip = new JSZip();
  zip.file('workbench.db', readFileSync(sqlite.name));

  const materialDir = getMaterialDir();
  const files = walk(materialDir);
  let included = 0;
  let skipped = 0;

  for (const file of files) {
    const st = statSync(file);
    if (st.size > MAX_FILE_BYTES) {
      skipped += 1;
      continue;
    }
    const rel = relative(materialDir, file).split(sep).join('/');
    zip.file(`ai-material/${rel}`, readFileSync(file));
    included += 1;
  }

  const tables = sqlite
    .prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
    )
    .all() as { name: string }[];

  const counts: Record<string, number> = {};
  for (const t of tables) {
    const row = sqlite.prepare(`SELECT count(*) as c FROM "${t.name}"`).get() as { c: number };
    counts[t.name] = row.c;
  }

  const meta: BackupMeta = {
    app: 'local-workbench',
    version: 1,
    exportedAt: new Date().toISOString(),
    dbFile: 'workbench.db',
    materialDir: 'ai-material',
    materialIncluded: included,
    materialSkipped: skipped,
    counts,
  };

  zip.file('meta.json', JSON.stringify(meta, null, 2));
  zip.file(
    'README.txt',
    [
      '本地个人工作台 · 备份包',
      '',
      '内容说明：',
      '  workbench.db  —— SQLite 数据库（9 张表全部数据）',
      '  ai-material/  —— 素材目录（Agent 白名单可读的 md/json/txt）',
      '  meta.json     —— 导出时间与各表条数',
      '',
      '恢复方式：工作台右上角「导入」选择本 zip 即可。',
    ].join('\n'),
  );

  const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  return { buffer, meta };
}

/** 备份文件名 */
export function backupFileName(): string {
  return `workbench-backup-${new Date().toISOString().slice(0, 10)}.zip`;
}

/**
 * 落盘到 App 数据目录 backups/（Tauri 模式）
 * 返回相对文件名，供 Rust 侧拼接路径并弹「另存为」
 */
export function saveBackupToAppDir(buffer: Buffer): { path: string; name: string; size: number } {
  const dir = getBackupDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const name = backupFileName();
  const full = join(dir, name);
  writeFileSync(full, buffer);
  return { path: full, name, size: buffer.byteLength };
}

/**
 * 校验导入来源路径。
 * 只接受 App 数据目录内的文件（Rust 会把用户选中的 zip 先复制进 backups/），
 * 避免 Web 端被构造任意路径读取系统文件。
 */
export function resolveImportPath(input: string): string {
  const abs = resolve(input);
  if (!isInsideDataRoot(abs)) {
    throw new Error('导入路径必须位于应用数据目录内');
  }
  if (!existsSync(abs)) throw new Error('备份文件不存在');
  if (!abs.toLowerCase().endsWith('.zip')) throw new Error('只支持 zip 备份文件');
  return abs;
}
