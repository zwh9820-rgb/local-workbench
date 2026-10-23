import { AGENT_TOOLS, getToolsForMode } from '@/lib/agent/tools';
import { getMaterialRoot, listMaterialFiles } from '@/lib/agent/files';
import { ok } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 工具清单（供 Agent 面板展示可用能力与文件白名单状态） */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get('mode') === 'files' ? 'files' : 'workbench';

  const tools = getToolsForMode(mode).map((t) => ({
    name: t.name,
    description: t.description,
    requiresFiles: Boolean(t.requiresFiles),
  }));

  let files: { path: string; size: number }[] = [];
  try {
    files = listMaterialFiles().map((f) => ({ path: f.path, size: f.size }));
  } catch {
    files = [];
  }

  return ok({
    mode,
    total: AGENT_TOOLS.length,
    enabled: tools.length,
    tools,
    materialRoot: getMaterialRoot(),
    files,
  });
}
