/**
 * 桌面模式自检（不需要 Tauri / Rust）
 *
 * 用法：
 *   WORKBENCH_DATA_DIR="C:/tmp/wb-desktop-test" npx tsx scripts/desktop-smoke.ts
 *   # Windows PowerShell: $env:WORKBENCH_DATA_DIR="C:\tmp\wb-desktop-test"; npx tsx scripts/desktop-smoke.ts
 *
 * 模拟 Rust 注入 WORKBENCH_DATA_DIR 后，验证：
 *   1. 数据库 / 素材 / 备份三个目录是否都落在 App 数据目录
 *   2. 首次启动是否自动建目录、写素材说明
 *   3. 备份能否正常打包落盘、导入路径校验是否生效
 *   4. Agent 文件白名单是否仍只认素材目录
 */
import { existsSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { getBackupDir, getDataRoot, getDbFile, getMaterialDir } from '../src/lib/paths';
import { sqlite } from '../src/db';
import { buildBackupZip, resolveImportPath, saveBackupToAppDir } from '../src/lib/backup';
import { readWhitelistFile } from '../src/lib/agent/files';

const ok = (label: string, pass: boolean, extra = '') =>
  console.log(`${pass ? '✅' : '⛔'} ${label}${extra ? `  ${extra}` : ''}`);

async function main() {
  if (!process.env.WORKBENCH_DATA_DIR) {
    console.error('请先设置 WORKBENCH_DATA_DIR，例如：');
    console.error('  WORKBENCH_DATA_DIR="C:/tmp/wb-desktop-test" npx tsx scripts/desktop-smoke.ts');
    process.exit(1);
  }

  const root = getDataRoot();
  const dbFile = getDbFile();
  const material = getMaterialDir();
  const backup = getBackupDir();

  console.log('--- 路径解析 ---');
  console.log('  data root :', root);
  console.log('  db file   :', dbFile);
  console.log('  material  :', material);
  console.log('  backups   :', backup);

  ok('数据库在数据目录内', dbFile.startsWith(root));
  ok('素材目录在数据目录内', material.startsWith(root));
  ok('备份目录在数据目录内', backup.startsWith(root));
  ok('数据库文件已创建', existsSync(dbFile));
  ok('素材目录已初始化', existsSync(material) && readdirSync(material).length > 0);

  console.log('\n--- 数据表 ---');
  const tables = sqlite
    .prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
    )
    .all() as { name: string }[];
  ok('9 张表就位', tables.length === 9, tables.map((t) => t.name).join(','));

  console.log('\n--- 备份 ---');
  const { buffer, meta } = await buildBackupZip();
  const saved = saveBackupToAppDir(buffer);
  ok('备份已落盘', existsSync(saved.path), `${saved.name} ${(saved.size / 1024).toFixed(1)}KB`);
  ok('meta 统计正常', Object.keys(meta.counts).length === 9);

  const resolved = resolveImportPath(saved.path);
  ok('导入路径校验通过', resolved === saved.path);

  let rejected = false;
  try {
    resolveImportPath('C:/Windows/System32/drivers/etc/hosts.zip');
  } catch {
    rejected = true;
  }
  ok('越界导入路径被拒绝', rejected);

  console.log('\n--- Agent 文件白名单 ---');
  const files = readdirSync(material);
  const firstReadable = files.find((f) => f.endsWith('.md'));
  if (firstReadable) {
    const file = readWhitelistFile(firstReadable);
    ok('素材文件可读', file.content.length > 0, `${file.path} ${file.size}B`);
  } else {
    console.log('  （素材目录没有 md 文件，跳过）');
  }

  let escapeRejected = false;
  try {
    readWhitelistFile('../../workbench.db');
  } catch {
    escapeRejected = true;
  }
  ok('路径穿越被拒绝', escapeRejected);

  console.log('\n提示：清理测试目录 →', `rm -rf "${root}"`);
  // 主动断开，避免 Windows 下文件占用
  sqlite.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
