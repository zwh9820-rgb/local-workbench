import { NextResponse } from 'next/server';
import { desc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { agentSession } from '@/db/schema';

/** 会话列表 / 新建空会话 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const rows = db
    .select({
      id: agentSession.id,
      title: agentSession.title,
      messageCount: agentSession.messageCount,
      status: agentSession.status,
      model: agentSession.model,
      updatedAt: agentSession.updatedAt,
    })
    .from(agentSession)
    .where(eq(agentSession.status, 'active'))
    .orderBy(desc(agentSession.updatedAt))
    .limit(100)
    .all();

  return NextResponse.json({ sessions: rows });
}

export async function POST() {
  const row = db
    .insert(agentSession)
    .values({ title: '新会话' })
    .returning()
    .get();

  return NextResponse.json({ session: row });
}
