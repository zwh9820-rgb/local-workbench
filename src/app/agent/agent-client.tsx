'use client';

import { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Plus,
  Send,
  Sparkles,
  Trash2,
  Wrench,
} from 'lucide-react';
import type { AgentMessage } from '@/db/schema';
import { MarkdownView } from '@/components/markdown/markdown-editor';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/card';
import { cn, timeAgo } from '@/lib/utils';
import { AGENT_TOOL_LABELS } from '@/lib/constants';

interface SessionItem {
  id: string;
  title: string;
  messageCount: number;
  updatedAt: Date | string;
}

interface ToolLogItem {
  id: string;
  toolName: string;
  status: 'success' | 'error';
  durationMs: number;
  error?: string | null;
  createdAt: Date | string;
}

/** SSE 帧类型（与 src/server/agent/run.ts 的 AgentStreamEvent 对应） */
type StreamEvent =
  | { type: 'delta'; text: string }
  | { type: 'tool_start'; name: string; label: string }
  | {
      type: 'tool_end';
      name: string;
      label: string;
      status: 'success' | 'error';
      durationMs: number;
      error?: string;
    }
  | {
      type: 'done';
      sessionId: string;
      title: string;
      messages: AgentMessage[];
      toolLogs: ToolLogItem[];
      steps: number;
      toolsEnabled: boolean;
    }
  | { type: 'error'; message: string };

type DoneEvent = Extract<StreamEvent, { type: 'done' }>;

const SUGGESTIONS = [
  '今天有哪些待办没做完？',
  '帮我把最近的灵感按状态梳理一下',
  '在画布上新建一个提示词节点，写一段赛博朋克街景',
  '根据今天的待办，帮我起草一份复盘',
];

export function AgentClient({
  initialSessions,
  initialSession,
  initialLogs,
  model,
  baseUrl,
}: {
  initialSessions: SessionItem[];
  initialSession: { id: string; title: string; messages: AgentMessage[] } | null;
  initialLogs: ToolLogItem[];
  model: string;
  baseUrl: string;
}) {
  const [sessions, setSessions] = useState<SessionItem[]>(initialSessions);
  const [activeId, setActiveId] = useState<string | null>(initialSession?.id ?? null);
  const [title, setTitle] = useState(initialSession?.title ?? '新会话');
  const [messages, setMessages] = useState<AgentMessage[]>(initialSession?.messages ?? []);
  const [logs, setLogs] = useState<ToolLogItem[]>(initialLogs);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showLogs, setShowLogs] = useState(false);
  /** 流式增量文本（正在生成的那条 assistant 消息） */
  const [streamText, setStreamText] = useState('');
  /** 当前正在执行的工具中文名 */
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, loading, streamText]);

  /* --------------------------- 发送消息（SSE 流式） --------------------------- */

  const send = async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || loading) return;

    setInput('');
    setError(null);
    setLoading(true);
    setStreamText('');
    setActiveTool(null);

    // 乐观追加用户消息
    const optimistic: AgentMessage = {
      id: `tmp-user-${Date.now()}`,
      role: 'user',
      content,
      createdAt: Date.now(),
    };
    setMessages((prev) => [...prev, optimistic]);

    try {
      const res = await fetch('/api/agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: activeId, text: content }),
      });

      if (!res.ok || !res.body) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `请求失败（${res.status}）`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let acc = '';
      let doneEvent: DoneEvent | null = null;

      // 逐帧解析 SSE
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split('\n\n');
        buffer = frames.pop() ?? '';

        for (const frame of frames) {
          const line = frame.trim();
          if (!line.startsWith('data:')) continue;

          let evt: StreamEvent;
          try {
            evt = JSON.parse(line.slice(5).trim()) as StreamEvent;
          } catch {
            continue;
          }

          if (evt.type === 'delta') {
            acc += evt.text;
            setStreamText(acc);
          } else if (evt.type === 'tool_start') {
            setActiveTool(evt.label);
          } else if (evt.type === 'tool_end') {
            setActiveTool(null);
            setLogs((prev) => [
              ...prev,
              {
                id: `tmp-log-${Date.now()}-${evt.name}`,
                toolName: evt.name,
                status: evt.status,
                durationMs: evt.durationMs,
                error: evt.error ?? null,
                createdAt: new Date(),
              },
            ]);
            setShowLogs(true);
          } else if (evt.type === 'done') {
            doneEvent = evt;
          } else if (evt.type === 'error') {
            throw new Error(evt.message);
          }
        }
      }

      const result = doneEvent;
      if (!result) throw new Error('连接中断，未收到完整结果');

      setMessages(result.messages);
      setActiveId(result.sessionId);
      setTitle(result.title);
      setStreamText('');
      // 用服务端真实日志替换临时占位
      setLogs((prev) => [
        ...prev.filter((l) => !l.id.startsWith('tmp-log-')),
        ...result.toolLogs,
      ]);
      setSessions((prev) => [
        {
          id: result.sessionId,
          title: result.title,
          messageCount: result.messages.length,
          updatedAt: new Date(),
        },
        ...prev.filter((s) => s.id !== result.sessionId),
      ]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '对话失败';
      setError(
        msg.includes('LM Studio') || msg.includes('fetch')
          ? `${msg}\n请确认 LM Studio 已启动并加载模型（${baseUrl}）`
          : msg,
      );
      // 回滚乐观消息
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      setInput(content);
      setStreamText('');
    } finally {
      setLoading(false);
      setActiveTool(null);
    }
  };

  /* ------------------------------ 会话操作 ------------------------------ */

  const switchSession = async (id: string) => {
    if (id === activeId || loading) return;
    try {
      const res = await fetch(`/api/agent/sessions/${id}`);
      const data = (await res.json()) as {
        session?: { id: string; title: string; messages: AgentMessage[] };
        logs?: ToolLogItem[];
      };
      if (data.session) {
        setActiveId(data.session.id);
        setTitle(data.session.title);
        setMessages(data.session.messages ?? []);
        setLogs(data.logs ?? []);
        setError(null);
      }
    } catch {
      setError('读取会话失败');
    }
  };

  const newSession = () => {
    if (loading) return;
    setActiveId(null);
    setTitle('新会话');
    setMessages([]);
    setLogs([]);
    setError(null);
  };

  const removeSession = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('删除这个会话？')) return;
    await fetch(`/api/agent/sessions/${id}`, { method: 'DELETE' });
    setSessions((prev) => prev.filter((s) => s.id !== id));
    if (id === activeId) newSession();
  };

  /* -------------------------------- 渲染 -------------------------------- */

  const visibleMessages = messages.filter(
    (m) => m.role === 'user' || (m.role === 'assistant' && m.content.trim()),
  );

  return (
    <div className="flex h-full">
      {/* 会话列表 */}
      <aside className="flex w-[212px] shrink-0 flex-col border-r border-line">
        <div className="flex h-topbar shrink-0 items-center justify-between border-b border-line px-2.5">
          <span className="text-xs font-medium text-ink-secondary">会话</span>
          <button
            type="button"
            onClick={newSession}
            title="新建会话"
            className="flex h-6 w-6 items-center justify-center rounded-md text-ink-secondary transition-colors hover:bg-app-hover hover:text-ink"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
          {sessions.length === 0 && (
            <p className="px-2 py-4 text-center text-2xs text-ink-muted">还没有会话</p>
          )}
          {sessions.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => void switchSession(s.id)}
              className={cn(
                'group mb-0.5 flex w-full items-start gap-1.5 rounded-md px-2 py-1.5 text-left transition-colors',
                s.id === activeId
                  ? 'bg-app-active text-ink'
                  : 'text-ink-secondary hover:bg-app-hover hover:text-ink',
              )}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs">{s.title}</span>
                <span className="mt-0.5 block text-[10px] text-ink-muted">
                  {s.messageCount} 条 · {timeAgo(new Date(s.updatedAt))}
                </span>
              </span>
              <span
                onClick={(e) => void removeSession(s.id, e)}
                className="mt-0.5 shrink-0 text-ink-muted opacity-0 transition-opacity hover:text-[var(--error)] group-hover:opacity-100"
              >
                <Trash2 className="h-3 w-3" />
              </span>
            </button>
          ))}
        </div>
      </aside>

      {/* 对话区 */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-topbar shrink-0 items-center gap-2 border-b border-line px-3">
          <Sparkles className="h-3.5 w-3.5 shrink-0 text-ink-muted" />
          <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">
            {title}
          </span>
          <span className="shrink-0 text-2xs text-ink-muted">{model}</span>
          {logs.length > 0 && (
            <button
              type="button"
              onClick={() => setShowLogs((v) => !v)}
              className="flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-2xs text-ink-muted transition-colors hover:bg-app-hover hover:text-ink"
            >
              <Wrench className="h-3 w-3" />
              {logs.length} 次工具调用
              {showLogs ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
            </button>
          )}
        </div>

        {/* 工具日志面板 */}
        {showLogs && logs.length > 0 && (
          <div className="max-h-[140px] shrink-0 overflow-y-auto border-b border-line bg-app-panel px-3 py-2">
            <ul className="space-y-1">
              {logs.map((l) => (
                <li
                  key={l.id}
                  className="flex items-center gap-2 text-2xs text-ink-secondary"
                >
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{
                      backgroundColor:
                        l.status === 'success' ? 'var(--success)' : 'var(--error)',
                    }}
                  />
                  <span className="font-medium">
                    {AGENT_TOOL_LABELS[l.toolName] ?? l.toolName}
                  </span>
                  <span className="text-ink-muted">{l.toolName}</span>
                  <span className="ml-auto shrink-0 text-ink-muted">
                    {l.durationMs}ms
                  </span>
                  {l.error && (
                    <span className="max-w-[240px] truncate text-[var(--error)]">
                      {l.error}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* 消息流 */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[760px] px-4 py-5">
            {visibleMessages.length === 0 && (
              <div className="py-10 text-center">
                <Sparkles className="mx-auto h-5 w-5 text-ink-muted" />
                <p className="mt-2 text-[13px] font-medium text-ink">内嵌 Agent</p>
                <p className="mx-auto mt-1 max-w-[420px] text-xs leading-5 text-ink-muted">
                  连的是本地 LM Studio，只读写本机数据库。
                  Agent 不会自动提交 ComfyUI 生成任务，出图始终需要你手动点运行。
                </p>
                <div className="mx-auto mt-4 flex max-w-[520px] flex-wrap justify-center gap-1.5">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => void send(s)}
                      className="rounded-md border border-line px-2.5 py-1.5 text-2xs text-ink-secondary transition-colors hover:bg-app-hover hover:text-ink"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-4">
              {visibleMessages.map((m) => (
                <div
                  key={m.id}
                  className={cn(
                    'flex',
                    m.role === 'user' ? 'justify-end' : 'justify-start',
                  )}
                >
                  {m.role === 'user' ? (
                    <div className="max-w-[80%] rounded-lg bg-app-active px-3 py-2 text-[13px] leading-6 text-ink">
                      {m.content}
                    </div>
                  ) : (
                    <div className="max-w-full flex-1">
                      <MarkdownView source={m.content} />
                    </div>
                  )}
                </div>
              ))}

              {/* 流式输出：边生成边渲染 */}
              {loading && (
                <div className="flex justify-start">
                  <div className="max-w-full flex-1">
                    {streamText ? (
                      <MarkdownView source={streamText} />
                    ) : (
                      <div className="flex items-center gap-2 text-xs text-ink-muted">
                        <Spinner />
                        {activeTool ? `正在调用「${activeTool}」…` : '正在思考…'}
                      </div>
                    )}

                    {streamText && (
                      <div className="mt-1.5 flex items-center gap-1.5 text-2xs text-ink-muted">
                        <span className="inline-block h-1.5 w-1.5 animate-progress-pulse rounded-full bg-ink-muted" />
                        {activeTool ? `调用「${activeTool}」…` : '生成中'}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {error && (
                <div className="flex items-start gap-2 rounded-md border border-line bg-app-panel px-3 py-2">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--error)]" />
                  <p className="whitespace-pre-wrap text-xs leading-5 text-ink-secondary">
                    {error}
                  </p>
                </div>
              )}
            </div>

            <div ref={bottomRef} />
          </div>
        </div>

        {/* 输入区 */}
        <div className="shrink-0 border-t border-line px-4 py-3">
          <div className="mx-auto flex w-full max-w-[760px] items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  void send();
                }
              }}
              rows={1}
              placeholder="问点什么，或让助手帮你整理待办、灵感、画布…（Enter 发送，Shift+Enter 换行）"
              className="max-h-[160px] min-h-[36px] flex-1 resize-none rounded-md border border-line bg-app px-2.5 py-2 text-[13px] leading-5 text-ink placeholder:text-ink-muted focus:border-line-strong focus:outline-none"
              style={{ height: Math.min(160, 36 + input.split('\n').length * 20) }}
            />
            <Button
              variant="primary"
              size="md"
              icon={<Send />}
              onClick={() => void send()}
              loading={loading}
              disabled={!input.trim()}
            >
              发送
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
