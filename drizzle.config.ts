import { defineConfig } from 'drizzle-kit';
import path from 'node:path';

/**
 * Drizzle Kit 配置
 * ---------------------------------------------------------------
 * - 数据库：SQLite（better-sqlite3 驱动，本地文件）
 * - 迁移产物：./drizzle 目录（sql 文件 + meta）
 * - 运行环境：Node 侧（Next.js Server / Tauri sidecar 均可直接复用）
 *
 * 注意：Tauri v2 打包后，DATABASE_URL 应指向系统 AppData 目录，
 *      例如 C:\Users\<user>\AppData\Roaming\<app>\workbench.db。
 *      通过 .env.local 或运行时配置注入，代码里不要硬编码路径。
 */
const databaseUrl =
  process.env.DATABASE_URL ?? path.join(process.cwd(), 'data', 'workbench.db');

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
  dbCredentials: {
    url: databaseUrl,
  },
  // 生成迁移时打印 SQL，便于 review
  verbose: true,
  // 迁移前二次确认（交互式），CI 场景可用 --force 覆盖
  strict: true,
});
