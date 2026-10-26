import { NextResponse } from 'next/server';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { agentSession, agentToolLog } from '@/db/schema';

/** 单个会话：读取详情（含工具日志） / 删除 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const session = db.select().from(agentSession).where(eq(agentSession.id, id)).get();
  if (!session) {
    return NextResponse.json({ error: '会话不存在' }, { status: 404 });
  }

  const logs = db
    .select()
    .from(agentToolLog)
    .where(eq(agentToolLog.sessionId, id))
    .orderBy(asc(agentToolLog.createdAt))
    .all();

  return NextResponse.json({ session, logs });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  // agent_tool_log 由外键 ON DELETE CASCADE 清理
  db.delete(agentSession).where(eq(agentSession.id, id)).run();
  return NextResponse.json({ ok: true });
}
