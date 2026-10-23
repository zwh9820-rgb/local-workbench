/**
 * 假的 LM Studio（OpenAI 兼容）服务，仅用于本地验证 Agent 循环。
 * 用法：node scripts/mock-lm-server.js
 *
 * 行为：
 *  - GET  /v1/models           返回一个假模型
 *  - POST /v1/chat/completions 第一次返回 tool_call(listInspiration)，
 *                              收到 tool 结果后返回最终文本
 *
 * 这样即使没装 LM Studio，也能验证：function calling 解析、工具执行、结果回灌、
 * 会话消息落库、历史重建。
 */
const http = require('node:http');

const PORT = 1234;
let round = 0;

const server = http.createServer((req, res) => {
  const url = req.url || '/';

  if (req.method === 'GET' && url.endsWith('/models')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ object: 'list', data: [{ id: 'deepseek-mock', object: 'model' }] }));
    return;
  }

  if (req.method === 'POST' && url.endsWith('/chat/completions')) {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const payload = JSON.parse(body || '{}');
      const messages = payload.messages || [];
      const hasToolResult = messages.some((m) => m.role === 'tool');
      round += 1;

      let message;
      if (!hasToolResult) {
        // 第一轮：要求调用工具
        message = {
          role: 'assistant',
          content: '',
          tool_calls: [
            {
              id: `call_${round}`,
              type: 'function',
              function: {
                name: 'listInspiration',
                arguments: JSON.stringify({ status: 'ongoing', limit: 3 }),
              },
            },
          ],
        };
      } else {
        // 第二轮：根据工具结果给出回答
        const toolMsg = messages.filter((m) => m.role === 'tool').pop();
        let count = 0;
        try {
          count = JSON.parse(toolMsg.content).count ?? 0;
        } catch {
          /* ignore */
        }
        message = {
          role: 'assistant',
          content: `我查到 **${count}** 条进行中的灵感，已经列在上面了。需要我把其中一条标记为完成吗？`,
        };
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          id: `chatcmpl-${round}`,
          object: 'chat.completion',
          created: Math.floor(Date.now() / 1000),
          model: payload.model || 'deepseek-mock',
          choices: [{ index: 0, message, finish_reason: message.tool_calls ? 'tool_calls' : 'stop' }],
          usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
        }),
      );
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: { message: 'not found' } }));
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[mock-lm] listening on http://127.0.0.1:${PORT}/v1`);
});
