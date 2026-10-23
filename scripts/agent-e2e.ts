/**
 * Agent 端到端自检（配合 scripts/mock-lm-server.js 使用）
 *
 * 终端 1：node scripts/mock-lm-server.js
 * 终端 2：npx tsx scripts/agent-e2e.ts
 *
 * 验证点：function calling 解析 → 工具执行 → 结果回灌 → 会话与日志落库。
 */
import { eq } from 'drizzle-orm';
import { db } from '../src/db';
import { agentSession, agentToolLog } from '../src/db/schema';
import { runAgent } from '../src/lib/agent/loop';

async function main() {
  const result = await runAgent({
    userMessage: '帮我看下现在进行中的灵感有哪些',
    mode: 'workbench',
  });

  console.log('会话 ID:', result.session.id);
  console.log('模型:', result.model);
  console.log('轮次:', result.steps);
  console.log('工具调用:', result.toolExecutions.map((t) => `${t.toolName}(${t.status}, ${t.durationMs}ms)`));
  console.log('回复:\n' + result.assistantMessage.content);

  const [session] = await db
    .select()
    .from(agentSession)
    .where(eq(agentSession.id, result.session.id))
    .limit(1);
  const logs = await db
    .select()
    .from(agentToolLog)
    .where(eq(agentToolLog.sessionId, result.session.id));

  console.log('\n落库检查：');
  console.log('  消息条数:', session.messageCount, '角色序列:', session.messages.map((m) => m.role).join(' → '));
  console.log('  工具日志:', logs.length, '条 →', logs.map((l) => l.toolName).join(', '));
}

main().catch((err) => {
  console.error('E2E 失败:', err);
  process.exit(1);
});
