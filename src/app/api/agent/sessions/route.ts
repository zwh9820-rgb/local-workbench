import { desc } from 'drizzle-orm';
import { db } from '@/db';
import { agentSession } from '@/db/schema';
import { ok } from '@/lib/http';
import { agentSessionCreateSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 会话列表（不含 messages，避免列表接口过大） */
export async function GET() {
  const rows = await db
    .select({
      id: agentSession.id,
      title: agentSession.title,
      mode: agentSession.mode,
      model: agentSession.model,
      status: agentSession.status,
      messageCount: agentSession.messageCount,
      lastMessageAt: agentSession.lastMessageAt,
      createdAt: agentSession.createdAt,
      updatedAt: agentSession.updatedAt,
    })
    .from(agentSession)
    .orderBy(desc(agentSession.updatedAt))
    .limit(200);

  return ok(rows);
}

/** 新建空会话 */
export async function POST(req: Request) {
  const input = agentSessionCreateSchema.parse(await req.json().catch(() => ({})));

  const [row] = await db
    .insert(agentSession)
    .values({
      title: input.title?.trim() || '新会话',
      mode: input.mode,
      model: input.model ?? null,
      messages: [],
      messageCount: 0,
    })
    .returning();

  return ok(row);
}
