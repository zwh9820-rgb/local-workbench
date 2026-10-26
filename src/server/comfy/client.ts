/**
 * ComfyUI HTTP 客户端（服务端专用）
 * ----------------------------------------------------------------------------
 * 只对接本机 ComfyUI（默认 http://127.0.0.1:8188），不做云端。
 * 工作台不负责启动 ComfyUI，需要用户提前运行。
 *
 * 涉及的官方接口：
 *   POST /prompt              提交工作流，返回 prompt_id
 *   GET  /history/{prompt_id} 查询任务结果（含输出图片列表）
 *   GET  /queue               队列状态
 *   GET  /view                取图（filename/subfolder/type）
 *   GET  /object_info         节点定义（校验工作流用）
 *   WS   /ws?clientId=        实时进度
 */

export interface ComfyImageRef {
  filename: string;
  subfolder: string;
  type: string;
}

export interface ComfyHistoryEntry {
  prompt: unknown;
  outputs: Record<
    string,
    {
      images?: ComfyImageRef[];
      gifs?: ComfyImageRef[];
      text?: string[];
    }
  >;
  status?: {
    status_str?: string;
    completed?: boolean;
    messages?: unknown[];
  };
}

export interface SubmitResult {
  prompt_id: string;
  number: number;
  node_errors?: Record<string, unknown>;
}

/** 规范化 host：去尾斜杠，补协议 */
export function normalizeHost(raw: string): string {
  let host = (raw || '').trim().replace(/\/+$/, '');
  if (!host) host = 'http://127.0.0.1:8188';
  if (!/^https?:\/\//i.test(host)) host = `http://${host}`;
  return host;
}

/** host → ws 地址 */
export function toWsUrl(host: string, clientId?: string): string {
  const base = normalizeHost(host).replace(/^http/i, 'ws');
  return `${base}/ws${clientId ? `?clientId=${encodeURIComponent(clientId)}` : ''}`;
}

/** 统一 fetch：带超时与错误信息 */
async function request<T>(
  host: string,
  path: string,
  init?: RequestInit & { timeoutMs?: number },
): Promise<T> {
  const url = `${normalizeHost(host)}${path}`;
  const timeoutMs = init?.timeoutMs ?? 15_000;

  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...init?.headers,
      },
      cache: 'no-store',
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `无法连接 ComfyUI（${normalizeHost(host)}）：${msg}。请确认 ComfyUI 已启动并监听 8188 端口。`,
    );
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(
      `ComfyUI 接口 ${path} 返回 ${res.status}${text ? `：${text.slice(0, 300)}` : ''}`,
    );
  }

  return (await res.json()) as T;
}

/* ------------------------------ 任务提交 ------------------------------- */

/**
 * 提交工作流
 * @param workflow API 格式工作流（{ "3": { class_type, inputs } }）
 * @param clientId 与 WS 连接一致的 clientId，便于对齐消息
 */
export async function submitPrompt(
  host: string,
  workflow: Record<string, unknown>,
  clientId?: string,
): Promise<SubmitResult> {
  const body: Record<string, unknown> = { prompt: workflow };
  if (clientId) body.client_id = clientId;

  const data = await request<SubmitResult>(host, '/prompt', {
    method: 'POST',
    body: JSON.stringify(body),
    timeoutMs: 30_000,
  });

  if (!data?.prompt_id) {
    throw new Error('ComfyUI 未返回 prompt_id，工作流可能无效');
  }

  // node_errors 非空说明部分节点校验失败（ComfyUI 仍可能入队）
  if (data.node_errors && Object.keys(data.node_errors).length > 0) {
    throw new Error(
      `工作流节点校验失败：${JSON.stringify(data.node_errors).slice(0, 500)}`,
    );
  }

  return data;
}

/* ------------------------------ 结果查询 ------------------------------- */

export async function getHistory(
  host: string,
  promptId: string,
): Promise<ComfyHistoryEntry | null> {
  const data = await request<Record<string, ComfyHistoryEntry>>(
    host,
    `/history/${encodeURIComponent(promptId)}`,
  );
  return data?.[promptId] ?? null;
}

/** 取该任务所有输出图片（按节点顺序展开） */
export function collectImages(entry: ComfyHistoryEntry | null): ComfyImageRef[] {
  if (!entry?.outputs) return [];
  const out: ComfyImageRef[] = [];
  for (const nodeOutput of Object.values(entry.outputs)) {
    for (const img of nodeOutput.images ?? []) out.push(img);
    for (const gif of nodeOutput.gifs ?? []) out.push(gif);
  }
  return out;
}

export async function getQueue(host: string): Promise<{
  queue_running: unknown[][];
  queue_pending: unknown[][];
}> {
  return request(host, '/queue');
}

/** 最近的任务记录（用于「抓取当前工作流」兜底） */
export async function getRecentHistory(
  host: string,
  maxItems = 5,
): Promise<Array<{ promptId: string; entry: ComfyHistoryEntry }>> {
  const data = await request<Record<string, ComfyHistoryEntry>>(
    host,
    `/history?max_items=${maxItems}`,
  );
  return Object.entries(data ?? {}).map(([promptId, entry]) => ({ promptId, entry }));
}

/* -------------------------------- 取图 --------------------------------- */

/** 生成 /view 的直连地址（前端 <img> 用，或服务端下载用） */
export function buildViewUrl(host: string, img: ComfyImageRef): string {
  const params = new URLSearchParams({
    filename: img.filename,
    subfolder: img.subfolder ?? '',
    type: img.type ?? 'output',
  });
  return `${normalizeHost(host)}/view?${params.toString()}`;
}

/** 下载图片二进制（回填时落盘/解析元数据用） */
export async function downloadImage(
  host: string,
  img: ComfyImageRef,
): Promise<{ buffer: Buffer; contentType: string }> {
  const url = buildViewUrl(host, img);
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000), cache: 'no-store' });
  if (!res.ok) throw new Error(`下载图片失败：${res.status} ${img.filename}`);
  const ab = await res.arrayBuffer();
  return {
    buffer: Buffer.from(ab),
    contentType: res.headers.get('content-type') ?? 'image/png',
  };
}

/* ---------------------------- 抓取当前工作流 ---------------------------- */

/**
 * 尝试读取 ComfyUI 最近一次执行的工作流（API 格式）。
 * ComfyUI 没有「读取前端正在编辑的画布」的公开接口，实务上最可靠的是
 * 从 /history 取最近一条 prompt —— 也就是用户上一次点「运行」时提交的工作流。
 */
export async function fetchLatestWorkflow(
  host: string,
): Promise<{ workflow: Record<string, unknown>; promptId: string } | null> {
  const recent = await getRecentHistory(host, 10);
  for (const { promptId, entry } of recent) {
    const wf = entry?.prompt;
    if (wf && typeof wf === 'object' && Object.keys(wf as object).length > 0) {
      return { workflow: wf as Record<string, unknown>, promptId };
    }
  }
  return null;
}

/** 健康检查 */
export async function ping(host: string): Promise<{
  ok: boolean;
  queue?: { running: number; pending: number };
  error?: string;
}> {
  try {
    const q = await request<{ queue_running: unknown[]; queue_pending: unknown[] }>(
      host,
      '/queue',
      { timeoutMs: 5_000 },
    );
    return {
      ok: true,
      queue: {
        running: q.queue_running?.length ?? 0,
        pending: q.queue_pending?.length ?? 0,
      },
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : '连接失败' };
  }
}
