/**
 * ============================================================================
 *  数据库连接层（单例）
 * ----------------------------------------------------------------------------
 *  - 驱动：better-sqlite3（同步、零依赖、单文件）
 *  - ORM：drizzle-orm/better-sqlite3
 *  - 特性：
 *      1. WAL 模式（并发读不阻塞写，画布自动保存时更稳）
 *      2. foreign_keys = ON（canvas 删除时级联清理 canvas_node）
 *      3. 首次连接自动执行迁移（dev 直接 npm run dev 就能用，无需手动建表）
 *      4. globalThis 缓存实例，避免 Next dev 热更新时重复打开文件句柄
 *
 *  Tauri v2 迁移提示：
 *      DATABASE_URL 指向 AppData 绝对路径即可，本文件其余逻辑无需改动。
 * ============================================================================
 */
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from './schema';

/** 解析数据库绝对路径（支持相对 cwd 的配置） */
export function resolveDbPath(): string {
  const raw = process.env.DATABASE_URL ?? './data/workbench.db';
  return path.isAbsolute(raw) ? raw : path.join(process.cwd(), raw);
}

/** 迁移目录（drizzle-kit generate 的产物） */
export const MIGRATIONS_DIR = path.join(process.cwd(), 'drizzle');

export const DB_PATH = resolveDbPath();

type DB = BetterSQLite3Database<typeof schema>;

interface Connection {
  sqlite: Database.Database;
  db: DB;
}

/** dev 热更新时复用同一连接，避免 "database is locked" */
const globalForDb = globalThis as unknown as { __workbenchDb?: Connection };

/**
 * 构建期（next build）会在多个 worker 中并行 import 本模块，
 * 此时不要执行迁移：多进程同时 ALTER/CREATE 会互相锁库导致 SQLITE_BUSY。
 * 迁移放到「首次真实请求」时执行即可（migrate 本身是幂等的）。
 */
const IS_BUILD_PHASE = process.env.NEXT_PHASE === 'phase-production-build';

function createConnection(): Connection {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

  const sqlite = new Database(DB_PATH);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('synchronous = NORMAL');
  sqlite.pragma('foreign_keys = ON');
  // 5s 忙等，画布拖拽高频写盘时避免直接抛 SQLITE_BUSY
  sqlite.pragma('busy_timeout = 5000');

  const db = drizzle(sqlite, { schema });

  // 自动迁移：drizzle 内部维护 __drizzle_migrations 表，重复调用是幂等的
  if (!IS_BUILD_PHASE && fs.existsSync(MIGRATIONS_DIR)) {
    migrate(db, { migrationsFolder: MIGRATIONS_DIR });
  }

  return { sqlite, db };
}

function getConnection(): Connection {
  if (!globalForDb.__workbenchDb) {
    globalForDb.__workbenchDb = createConnection();
  }
  return globalForDb.__workbenchDb;
}

const connection = getConnection();

/** drizzle 实例：所有查询入口 */
export const db = connection.db;

/** 原生句柄：需要手写 SQL / 事务 / pragma 时使用 */
export const sqlite = connection.sqlite;

/** 便于 `import { schema }` 统一取表 */
export { schema };

/**
 * 同步事务包装（better-sqlite3 事务是同步的，不能包 async 函数）
 * 用法：runInTransaction((tx) => { tx.insert(...).run(); })
 */
export function runInTransaction<T>(fn: (tx: DB) => T): T {
  const tx = sqlite.transaction(() => fn(db));
  return tx();
}
