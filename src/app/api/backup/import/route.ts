import JSZip from 'jszip';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { sqlite, DB_PATH } from '@/db';

/**
 * 导入备份
 * POST /api/backup/import   multipart/form-data  file=<zip>
 *
 * 为什么不用「直接替换 db 文件」：
 *   Windows 下当前连接独占着 workbench.db，没法覆盖。
 *   这里改成 ATTACH 临时库 + 逐表覆盖，全程在当前连接内完成，无需重启。
 *
 * 安全措施：
 *   1. 导入前先 VACUUM INTO 一份 .before-import 快照，出问题能回退
 *   2. 只复制已知的 8 张业务表，不执行备份里的任何 DDL
 *   3. 全程包在事务里，失败自动回滚
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/** 覆盖顺序：子表在前，父表在后 */
const TABLES = [
  'agent_tool_log',
  'canvas_node',
  'agent_session',
  'canvas',
  'inspiration',
  'todo_items',
  'daily_review',
  'events',
] as const;

export async function POST(req: Request) {
  let tmpDir = '';
  try {
    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: '缺少备份文件' }, { status: 400 });
    }

    /* ------------------------- 1. 解压取 db ------------------------- */
    const zipBuf = Buffer.from(await file.arrayBuffer());
    const zip = await JSZip.loadAsync(zipBuf);
    const entry = zip.file('workbench.db');
    if (!entry) {
      return NextResponse.json(
        { error: '压缩包里没有 workbench.db，请选择本应用导出的备份' },
        { status: 400 },
      );
    }

    const dbBuf = await entry.async('nodebuffer');
    if (dbBuf.subarray(0, 16).toString('ascii') !== 'SQLite format 3\u0000') {
      return NextResponse.json({ error: 'workbench.db 不是有效的 SQLite 文件' }, { status: 400 });
    }

    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-import-'));
    const tmpDb = path.join(tmpDir, 'import.db');
    fs.writeFileSync(tmpDb, dbBuf);

    /* ---------------------- 2. 先给当前库拍快照 ---------------------- */
    const safetyPath = `${DB_PATH}.before-import-${Date.now()}.db`;
    sqlite.exec(`VACUUM INTO '${safetyPath.replace(/'/g, "''")}'`);

    /* ---------------------- 3. ATTACH + 逐表覆盖 ---------------------- */
    sqlite.prepare('ATTACH DATABASE ? AS imported').run(tmpDb);

    const counts: Record<string, number> = {};

    try {
      const hasTable = sqlite.prepare(
        `SELECT count(*) AS c FROM imported.sqlite_master WHERE type='table' AND name=?`,
      );

      // 外键暂时关闭，避免覆盖顺序引发约束错误
      sqlite.exec('PRAGMA foreign_keys = OFF');

      const run = sqlite.transaction(() => {
        for (const t of TABLES) {
          const found = hasTable.get(t) as { c: number };
          if (!found?.c) continue; // 备份里没有这张表，跳过
          sqlite.exec(`DELETE FROM main.${t}`);
          sqlite.exec(`INSERT INTO main.${t} SELECT * FROM imported.${t}`);
        }
      });
      run();

      sqlite.exec('PRAGMA foreign_keys = ON');

      for (const t of TABLES) {
        const row = sqlite.prepare(`SELECT count(*) AS c FROM main.${t}`).get() as {
          c: number;
        };
        counts[t] = row.c;
      }
    } finally {
      try {
        sqlite.exec('DETACH DATABASE imported');
      } catch {
        /* 已 detach */
      }
    }

    return NextResponse.json({
      ok: true,
      counts,
      safetyBackup: safetyPath,
    });
  } catch (err) {
    console.error('[api/backup/import]', err);
    const msg = err instanceof Error ? err.message : '导入失败';
    return NextResponse.json(
      {
        error: msg.includes('no such column') || msg.includes('has no column')
          ? `备份文件与当前版本的表结构不一致：${msg}`
          : msg,
      },
      { status: 500 },
    );
  } finally {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}
