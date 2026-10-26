import { desc, eq, asc } from 'drizzle-orm';
import { db } from '@/db';
import { agentSession, agentToolLog } from '@/db/schema';
import { readSettings } from '@/server/settings';
import { AgentClient } from './agent-client';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'AI 助手' };

export default async function AgentPage({
  searchParams,
}: {
  searchParams: Promise<{ session?: string }>;
}) {
  const sp = await searchParams;

  const sessions = db
    .select({
      id: agentSession.id,
      title: agentSession.title,
      messageCount: agentSession.messageCount,
      updatedAt: agentSession.updatedAt,
    })
    .from(agentSession)
    .where(eq(agentSession.status, 'active'))
    .orderBy(desc(agentSession.updatedAt))
    .limit(100)
    .all();

  const activeId = sp.session ?? sessions[0]?.id;
  const session = activeId
    ? db.select().from(agentSession).where(eq(agentSession.id, activeId)).get()
    : null;

  const logs = activeId
    ? db
        .select()
        .from(agentToolLog)
        .where(eq(agentToolLog.sessionId, activeId))
        .orderBy(asc(agentToolLog.createdAt))
        .all()
    : [];

  const settings = readSettings();

  return (
    <AgentClient
      initialSessions={sessions}
      initialSession={session ?? null}
      initialLogs={logs.map((l) => ({
        id: l.id,
        toolName: l.toolName,
        status: l.status,
        durationMs: l.durationMs,
        error: l.error,
        createdAt: l.createdAt,
      }))}
      model={settings.lmStudio.model}
      baseUrl={settings.lmStudio.baseUrl}
    />
  );
}
