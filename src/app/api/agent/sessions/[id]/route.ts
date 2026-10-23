import { asc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { agentSession, agentToolLog } from '@/db/schema';
import { fail, ok } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/** 会话详情 + 该会话全部工具调用日志（用于历史回放） */
export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;

  const [session] = await db
    .select()
    .from(agentSession)
    .where(eq(agentSession.id, id))
    .limit(1);

  if (!session) return fail('会话不存在', 404);

  const logs = await db
    .select()
    .from(agentToolLog)
    .where(eq(agentToolLog.sessionId, id))
    .orderBy(asc(agentToolLog.createdAt));

  return ok({ session, toolLogs: logs });
}

/** 改标题 / 切模式 / 归档 */
export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const body = (await req.json()) as {
    title?: string;
    mode?: 'workbench' | 'files';
    status?: 'active' | 'archived';
  };

  const [row] = await db
    .update(agentSession)
    .set({
      ...(body.title !== undefined && { title: body.title }),
      ...(body.mode !== undefined && { mode: body.mode }),
      ...(body.status !== undefined && { status: body.status }),
      updatedAt: new Date(),
    })
    .where(eq(agentSession.id, id))
    .returning();

  if (!row) return fail('会话不存在', 404);
  return ok(row);
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  // agent_tool_log 上设置了 onDelete: cascade，删会话会连带清理日志
  await db.delete(agentSession).where(eq(agentSession.id, id));
  return ok({ deleted: true });
}
