/**
 * 正式迁移入口：npm run db:migrate
 * 前提是先执行过 npm run db:generate 生成 drizzle/ 目录。
 *
 * 说明：应用启动时 src/db/init.ts 已用幂等 DDL 建表，
 * 这里主要给「以后改表结构」的增量迁移用。
 */
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { db, resolveDbPath, sqlite } from './index';

const folder = resolve(process.cwd(), 'drizzle');

console.log('[db] 数据库文件:', resolveDbPath());

if (!existsSync(folder)) {
  console.log('[db] 未找到 drizzle/ 迁移目录，已由 init.ts 完成基础建表，跳过 migrate。');
  console.log('[db] 如需增量迁移，先执行: npm run db:generate');
} else {
  migrate(db, { migrationsFolder: folder });
  console.log('[db] 迁移完成');
}

const tables = sqlite
  .prepare(
    `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle%' ORDER BY name`,
  )
  .all() as { name: string }[];

console.log('[db] 当前表:', tables.map((t) => t.name).join(', '));
