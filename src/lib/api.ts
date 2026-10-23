/**
 * 前端统一请求层。
 *
 * 迁移 Tauri 时只需要改这一个文件（把 fetch 换成 invoke），
 * 业务组件 / 页面代码完全不用动 —— 这是方案 A 兼容 Tauri 的关键隔离点。
 */
import type { ApiResult } from './http';

const BASE = '';

export class ApiClientError extends Error {
  status: number;
  detail?: unknown;
  constructor(message: string, status = 500, detail?: unknown) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.detail = detail;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
  });

  let payload: ApiResult<T> | null = null;
  try {
    payload = (await res.json()) as ApiResult<T>;
  } catch {
    // 非 JSON 响应（例如 500 页面）
  }

  if (!res.ok || !payload || payload.ok === false) {
    const message =
      payload && payload.ok === false ? payload.error : `请求失败 (${res.status})`;
    throw new ApiClientError(message, res.status, payload);
  }

  return payload.data;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body ?? {}) }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body ?? {}) }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body ?? {}) }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

/** 拼查询串，自动忽略空值 */
export function qs(params: Record<string, string | number | boolean | undefined | null>) {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null || v === '') return;
    sp.set(k, String(v));
  });
  const s = sp.toString();
  return s ? `?${s}` : '';
}
