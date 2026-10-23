import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { ensureSchema } from './init';
import * as schema from './schema';
import { ensureDataDirs, getDbFile, getMaterialDir } from '@/lib/paths';

/**
 * 数据库连接单例。
 *
 * 只在服务端（Node runtime）使用：
 * - Next.js API Route / Server Component 里 import 本文件
 * - 客户端组件一律走 /api/* 请求，绝不直接 import
 *
 * Tauri 适配：数据库文件位置由 @/lib/paths 统一决定
 *   Web 开发态 → <项目根>/data/workbench.db（或 DATABASE_URL）
 *   桌面打包后 → %APPDATA%/com.local.workbench/workbench.db
 * 除路径来源外，本文件与 Web 版完全一致（表结构、pragma、单例逻辑均未改动）。
 */

/** 解析数据库绝对路径并确保父目录存在 */
export function resolveDbPath(): string {
  const abs = getDbFile();
  const dir = dirname(abs);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return abs;
}

type DbInstance = BetterSQLite3Database<typeof schema>;

type GlobalCache = {
  __wb_sqlite?: Database.Database;
  __wb_db?: DbInstance;
};

const cache = globalThis as unknown as GlobalCache;

function createConnection() {
  // 桌面模式首次启动时把 ai-material / backups 一并建好
  ensureDataDirs();

  const sqlite = new Database(resolveDbPath());
  // WAL：读写并发更友好；外键约束必须显式开启
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('synchronous = NORMAL');
  // 首次启动自动建表（幂等）
  ensureSchema(sqlite);
  return sqlite;
}

/** 原生 better-sqlite3 实例，用于 FTS/自定义 SQL/备份 */
export const sqlite: Database.Database =
  cache.__wb_sqlite ?? (cache.__wb_sqlite = createConnection());

/** Drizzle ORM 实例 */
export const db: DbInstance =
  cache.__wb_db ?? (cache.__wb_db = drizzle(sqlite, { schema }));

export { schema, getMaterialDir };
export * from './schema';
