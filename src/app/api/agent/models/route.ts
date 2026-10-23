import { pingLm } from '@/lib/agent/client';
import { ok } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** LM Studio 连接状态 + 可用模型列表 */
export async function GET() {
  const status = await pingLm();
  return ok(status);
}
