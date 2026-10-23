import type Database from 'better-sqlite3';

/**
 * 幂等建表脚本。
 *
 * 为什么不用「必须跑 drizzle-kit push 才能启动」的方式？
 * 因为这是一个本地单人工作台，用户随时可能删库重来。
 * 这里用 CREATE TABLE IF NOT EXISTS 保证 `npm run dev` 直接可用，
 * 同时保留 drizzle-kit generate/push 作为正式迁移通道（两者 DDL 完全一致）。
 */
const DDL = /* sql */ `
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  start_at INTEGER NOT NULL,
  end_at INTEGER,
  all_day INTEGER NOT NULL DEFAULT 0,
  location TEXT,
  category TEXT,
  tags TEXT DEFAULT '[]',
  remind_at INTEGER,
  is_done INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE INDEX IF NOT EXISTS events_start_at_idx ON events (start_at);

CREATE TABLE IF NOT EXISTS todo_items (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  priority TEXT NOT NULL DEFAULT 'medium',
  plan_date TEXT NOT NULL,
  week_key TEXT NOT NULL,
  due_date TEXT,
  tags TEXT DEFAULT '[]',
  source TEXT NOT NULL DEFAULT 'manual',
  estimate_min INTEGER,
  sort_order INTEGER NOT NULL DEFAULT 0,
  completed_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE INDEX IF NOT EXISTS todo_plan_date_idx ON todo_items (plan_date);
CREATE INDEX IF NOT EXISTS todo_week_key_idx ON todo_items (week_key);
CREATE INDEX IF NOT EXISTS todo_status_idx ON todo_items (status);

CREATE TABLE IF NOT EXISTS ai_hot (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  content TEXT,
  source TEXT,
  source_url TEXT,
  category TEXT,
  tags TEXT DEFAULT '[]',
  heat INTEGER NOT NULL DEFAULT 0,
  published_at INTEGER,
  is_starred INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE INDEX IF NOT EXISTS ai_hot_created_idx ON ai_hot (created_at);

CREATE TABLE IF NOT EXISTS daily_review (
  id TEXT PRIMARY KEY NOT NULL,
  review_date TEXT NOT NULL,
  summary TEXT,
  well_done TEXT,
  problems TEXT,
  improvements TEXT,
  tomorrow_plan TEXT,
  content TEXT,
  mood_score INTEGER,
  energy_score INTEGER,
  tags TEXT DEFAULT '[]',
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE UNIQUE INDEX IF NOT EXISTS daily_review_date_uq ON daily_review (review_date);

CREATE TABLE IF NOT EXISTS inspiration (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  content TEXT,
  type TEXT NOT NULL DEFAULT 'note',
  status TEXT NOT NULL DEFAULT 'ongoing',
  progress INTEGER NOT NULL DEFAULT 0,
  tags TEXT DEFAULT '[]',
  local_path TEXT,
  cover_image TEXT,
  is_favorite INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE INDEX IF NOT EXISTS inspiration_status_idx ON inspiration (status);
CREATE INDEX IF NOT EXISTS inspiration_type_idx ON inspiration (type);
CREATE INDEX IF NOT EXISTS inspiration_updated_idx ON inspiration (updated_at);

CREATE TABLE IF NOT EXISTS prompt_templates (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  content TEXT NOT NULL DEFAULT '',
  variables TEXT DEFAULT '[]',
  category TEXT,
  tags TEXT DEFAULT '[]',
  model TEXT,
  usage_count INTEGER NOT NULL DEFAULT 0,
  last_used_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE INDEX IF NOT EXISTS prompt_templates_category_idx ON prompt_templates (category);

CREATE TABLE IF NOT EXISTS clipboard_snapshots (
  id TEXT PRIMARY KEY NOT NULL,
  content TEXT NOT NULL,
  content_type TEXT NOT NULL DEFAULT 'text',
  source_app TEXT,
  char_count INTEGER NOT NULL DEFAULT 0,
  is_pinned INTEGER NOT NULL DEFAULT 0,
  inspiration_id TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE INDEX IF NOT EXISTS clipboard_created_idx ON clipboard_snapshots (created_at);

CREATE TABLE IF NOT EXISTS agent_session (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL DEFAULT '新会话',
  mode TEXT NOT NULL DEFAULT 'workbench',
  model TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  messages TEXT NOT NULL DEFAULT '[]',
  message_count INTEGER NOT NULL DEFAULT 0,
  last_message_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE INDEX IF NOT EXISTS agent_session_updated_idx ON agent_session (updated_at);

CREATE TABLE IF NOT EXISTS agent_tool_log (
  id TEXT PRIMARY KEY NOT NULL,
  session_id TEXT NOT NULL REFERENCES agent_session (id) ON DELETE CASCADE,
  message_id TEXT,
  tool_name TEXT NOT NULL,
  args TEXT,
  result TEXT,
  status TEXT NOT NULL DEFAULT 'ok',
  error TEXT,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE INDEX IF NOT EXISTS agent_tool_log_session_idx ON agent_tool_log (session_id);
CREATE INDEX IF NOT EXISTS agent_tool_log_created_idx ON agent_tool_log (created_at);
`;

export function ensureSchema(sqlite: Database.Database) {
  sqlite.exec(DDL);
}
