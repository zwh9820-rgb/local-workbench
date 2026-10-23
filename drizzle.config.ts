import { defineConfig } from 'drizzle-kit';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

/**
 * Drizzle Kit 配置（迁移 / push / studio）
 *
 * 注意：
 * 1. 数据库文件默认落在项目根 data/workbench.db，可用 DATABASE_URL 覆盖。
 * 2. 这里顺手保证 data 目录存在，避免首次 db:push 因目录缺失报错。
 * 3. sqlite 的 dbCredentials.url 传的是「文件路径」，不要带 file: 前缀。
 */
const dbFile = process.env.DATABASE_URL ?? './data/workbench.db';
const absolute = resolve(process.cwd(), dbFile);
const dir = dirname(absolute);
if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: absolute,
  },
  verbose: true,
  strict: true,
});
