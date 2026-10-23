/**
 * 工具自检脚本（不需要 LM Studio）
 * 用法：npx tsx scripts/smoke-tools.ts
 *
 * 作用：直接调用 Agent 的 9 个工具，验证 Zod 校验、SQL 读写、白名单路径校验、
 * JSON Schema 生成是否正常。联调模型前先跑这个，能排除一半问题。
 */
import { db } from '../src/db';
import { agentSession } from '../src/db/schema';
import { AGENT_TOOLS, executeTool, toOpenAITools } from '../src/lib/agent/tools';

async function main() {
  const [session] = await db.select().from(agentSession).limit(1);
  if (!session) throw new Error('没有会话，先跑 npm run db:seed');

  const ctx = { sessionId: session.id, mode: 'files' as const };

  console.log('--- function calling schema ---');
  const tools = toOpenAITools('files');
  console.log(`工具数：${tools.length}`);
  console.log(JSON.stringify(tools[0], null, 2).slice(0, 500));

  console.log('\n--- 逐个执行工具 ---');
  const calls: Array<[string, string]> = [
    ['listInspiration', JSON.stringify({ status: 'ongoing', limit: 3 })],
    ['listTodo', JSON.stringify({ scope: 'today' })],
    ['createTodo', JSON.stringify({ title: '【自检】工具调用测试', priority: 'low' })],
    ['searchAll', JSON.stringify({ keyword: 'comfyui', limit: 2 })],
    ['readWhiteListFile', JSON.stringify({ path: 'workflows/i2v_consistency.json' })],
    ['readWhiteListFile', JSON.stringify({ path: '../../../package.json' })],
    ['readWhiteListFile', JSON.stringify({ path: 'C:/Windows/win.ini' })],
    ['createReview', JSON.stringify({ summary: '自检写入的复盘草稿' })],
  ];

  for (const [name, args] of calls) {
    const res = await executeTool(name, args, ctx);
    const brief =
      res.status === 'ok' ? res.content.slice(0, 160) : `❌ ${res.error}`;
    console.log(`${res.status === 'ok' ? '✅' : '⛔'} ${name} (${res.durationMs}ms): ${brief}`);
  }

  console.log(`\n工具总数：${AGENT_TOOLS.length}（files 模式可用 ${tools.length}）`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
