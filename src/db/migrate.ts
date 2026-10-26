/**
 * 迁移脚本（CLI）
 * 运行：npm run db:migrate
 * 说明：src/db/index.ts 在建立连接时已自动迁移，此脚本用于 CI / 手动重跑 / 排查。
 */
import fs from 'node:fs';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { db, sqlite, DB_PATH, MIGRATIONS_DIR } from './index';

function main() {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    console.error(
      `[migrate] 未找到迁移目录：${MIGRATIONS_DIR}\n` +
        `请先执行：npm run db:generate`,
    );
    process.exit(1);
  }

  console.log(`[migrate] 数据库：${DB_PATH}`);
  migrate(db, { migrationsFolder: MIGRATIONS_DIR });

  const tables = sqlite
    .prepare(`select name from sqlite_master where type='table' order by name`)
    .all() as Array<{ name: string }>;

  console.log(`[migrate] 完成，共 ${tables.length} 张表：`);
  for (const t of tables) console.log(`  - ${t.name}`);

  sqlite.close();
}

main();
