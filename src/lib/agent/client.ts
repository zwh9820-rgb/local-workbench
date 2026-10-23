import OpenAI from 'openai';

/**
 * LM Studio 客户端封装。
 *
 * 约定：
 * - 只连本机 http://127.0.0.1:1234/v1（OpenAI 兼容接口）
 * - 不读取任何云端 OpenAI key，apiKey 只是协议占位
 * - LM Studio 作为外部独立程序运行，本应用不打包模型
 */

export const LM_BASE_URL =
  process.env.LM_STUDIO_BASE_URL?.trim() || 'http://127.0.0.1:1234/v1';

export const DEFAULT_MODEL =
  process.env.LM_STUDIO_MODEL?.trim() || 'deepseek-r1-distill-qwen-7b';

let cached: OpenAI | null = null;

/** 单例 client（LM Studio 不校验 key，但 SDK 要求非空字符串） */
export function getLmClient(): OpenAI {
  if (cached) return cached;
  cached = new OpenAI({
    baseURL: LM_BASE_URL,
    apiKey: process.env.LM_STUDIO_API_KEY?.trim() || 'lm-studio',
    timeout: 120_000,
    maxRetries: 0, // 本地服务，失败就立刻反馈，别让用户干等
  });
  return cached;
}

export type LmModel = { id: string; owned_by?: string };

/** 列出 LM Studio 已加载的模型 */
export async function listModels(): Promise<LmModel[]> {
  const res = await fetch(`${LM_BASE_URL}/models`, {
    headers: {
      Authorization: `Bearer ${process.env.LM_STUDIO_API_KEY?.trim() || 'lm-studio'}`,
    },
    cache: 'no-store',
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`LM Studio 返回 ${res.status}`);
  const json = (await res.json()) as { data?: LmModel[] };
  return json.data ?? [];
}

/**
 * 解析实际使用的模型：
 * 1. 显式传入且存在 → 用它
 * 2. 环境变量指定且存在 → 用它
 * 3. 否则取第一个包含 deepseek 的模型
 * 4. 兜底取第一个已加载模型
 */
export async function resolveModel(preferred?: string): Promise<string> {
  try {
    const models = await listModels();
    const ids = models.map((m) => m.id);
    if (!ids.length) return preferred || DEFAULT_MODEL;

    if (preferred && ids.includes(preferred)) return preferred;
    const envModel = process.env.LM_STUDIO_MODEL?.trim();
    if (envModel && ids.includes(envModel)) return envModel;

    const deepseek = ids.find((id) => /deepseek/i.test(id));
    return deepseek ?? ids[0];
  } catch {
    // LM Studio 未启动时不让请求直接崩，交给上层给出可读提示
    return preferred || DEFAULT_MODEL;
  }
}

/** 健康检查：Agent 面板顶部展示连接状态 */
export async function pingLm(): Promise<{
  ok: boolean;
  baseUrl: string;
  models: string[];
  error?: string;
}> {
  try {
    const models = await listModels();
    return { ok: true, baseUrl: LM_BASE_URL, models: models.map((m) => m.id) };
  } catch (err) {
    return {
      ok: false,
      baseUrl: LM_BASE_URL,
      models: [],
      error: err instanceof Error ? err.message : '无法连接 LM Studio',
    };
  }
}
