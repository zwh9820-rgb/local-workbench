/**
 * 服务端 HTTP 小工具：统一 API 响应结构 & 错误处理。
 * 前端只需判断 res.ok，错误信息统一在 error.message。
 */
import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

export type ApiOk<T> = { ok: true; data: T };
export type ApiErr = { ok: false; error: string; detail?: unknown };
export type ApiResult<T> = ApiOk<T> | ApiErr;

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json<ApiOk<T>>({ ok: true, data }, init);
}

export function fail(error: string, status = 400, detail?: unknown) {
  return NextResponse.json<ApiErr>({ ok: false, error, detail }, { status });
}

/** 把 ZodError / 普通 Error 统一转成 400/500 响应 */
export function toErrorResponse(err: unknown) {
  if (err instanceof ZodError) {
    const first = err.issues[0];
    return fail(
      first ? `${first.path.join('.') || '参数'}: ${first.message}` : '参数校验失败',
      422,
      err.issues,
    );
  }
  if (err instanceof Error) {
    console.error('[api]', err.message);
    return fail(err.message, 500);
  }
  console.error('[api] unknown error', err);
  return fail('未知错误', 500);
}

/** 包装 route handler，省掉每个文件的 try/catch */
export function withHandler<Args extends unknown[]>(
  fn: (...args: Args) => Promise<Response>,
) {
  return async (...args: Args): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (err) {
      return toErrorResponse(err);
    }
  };
}
