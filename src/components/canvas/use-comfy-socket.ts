'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * ComfyUI WebSocket 监听
 * ----------------------------------------------------------------------------
 * 直连 ws://<host>/ws?clientId=xxx，把消息归一化成画布能用的语义事件。
 *
 * ComfyUI 的消息类型（data 内字段）：
 *   status           队列剩余数量
 *   execution_start  { prompt_id }
 *   execution_cached { prompt_id, nodes }
 *   executing        { prompt_id, node }  ← node 为 null 表示该任务全部执行完
 *   progress         { prompt_id, node, value, max }
 *   executed         { prompt_id, node, output }
 *   execution_error  { prompt_id, node_id, exception_message }
 *
 * 说明：WS 是浏览器直连（WS 不受 CORS 限制），提交任务仍走服务端 API。
 */

export type ComfySocketEvent =
  | { type: 'open' }
  | { type: 'close' }
  | { type: 'status'; queueRemaining: number }
  | { type: 'start'; promptId: string }
  | { type: 'executing'; promptId: string; node: string | null }
  | { type: 'progress'; promptId: string; node?: string; percent: number }
  | { type: 'done'; promptId: string }
  | { type: 'error'; promptId?: string; message: string };

interface RawMessage {
  type?: string;
  data?: Record<string, unknown>;
}

function toWsUrl(host: string, clientId: string): string {
  let base = (host || '').trim().replace(/\/+$/, '');
  if (!base) base = 'http://127.0.0.1:8188';
  if (!/^https?:\/\//i.test(base)) base = `http://${base}`;
  return `${base.replace(/^http/i, 'ws')}/ws?clientId=${encodeURIComponent(clientId)}`;
}

export function useComfySocket(
  host: string,
  onEvent: (evt: ComfySocketEvent) => void,
): { connected: boolean; clientId: string } {
  const [connected, setConnected] = useState(false);
  const clientIdRef = useRef<string>('');
  const onEventRef = useRef(onEvent);
  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closedByUsRef = useRef(false);

  // 保持回调最新，避免因回调变化反复重建连接
  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  // clientId 只生成一次
  if (!clientIdRef.current && typeof crypto !== 'undefined') {
    clientIdRef.current = crypto.randomUUID();
  }

  const connect = useCallback(() => {
    if (typeof window === 'undefined') return;
    if (wsRef.current && wsRef.current.readyState <= WebSocket.OPEN) return;

    let ws: WebSocket;
    try {
      ws = new WebSocket(toWsUrl(host, clientIdRef.current));
    } catch {
      // host 非法，稍后重试
      retryRef.current = setTimeout(connect, 3000);
      return;
    }

    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      onEventRef.current({ type: 'open' });
    };

    ws.onclose = () => {
      setConnected(false);
      onEventRef.current({ type: 'close' });
      wsRef.current = null;
      if (!closedByUsRef.current) {
        retryRef.current = setTimeout(connect, 3000);
      }
    };

    ws.onerror = () => {
      // 交给 onclose 统一处理重连
    };

    ws.onmessage = (e) => {
      let msg: RawMessage;
      try {
        msg = JSON.parse(e.data as string);
      } catch {
        return;
      }

      const data = (msg.data ?? {}) as Record<string, unknown>;
      const promptId = typeof data.prompt_id === 'string' ? data.prompt_id : undefined;

      switch (msg.type) {
        case 'status': {
          const status = data.status as
            | { exec_info?: { queue_remaining?: number } }
            | undefined;
          onEventRef.current({
            type: 'status',
            queueRemaining: status?.exec_info?.queue_remaining ?? 0,
          });
          break;
        }

        case 'execution_start':
          if (promptId) onEventRef.current({ type: 'start', promptId });
          break;

        case 'executing': {
          const node = data.node;
          if (!promptId) break;
          if (node === null) {
            onEventRef.current({ type: 'done', promptId });
          } else {
            onEventRef.current({
              type: 'executing',
              promptId,
              node: String(node),
            });
          }
          break;
        }

        case 'progress': {
          if (!promptId) break;
          const value = Number(data.value ?? 0);
          const max = Number(data.max ?? 1) || 1;
          onEventRef.current({
            type: 'progress',
            promptId,
            node: data.node ? String(data.node) : undefined,
            percent: Math.round((value / max) * 100),
          });
          break;
        }

        case 'execution_error':
          onEventRef.current({
            type: 'error',
            promptId,
            message:
              (data.exception_message as string) ||
              (data.exception_type as string) ||
              'ComfyUI 执行出错',
          });
          break;

        default:
          break;
      }
    };
  }, [host]);

  useEffect(() => {
    closedByUsRef.current = false;
    connect();
    return () => {
      closedByUsRef.current = true;
      if (retryRef.current) clearTimeout(retryRef.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [connect]);

  return { connected, clientId: clientIdRef.current };
}
