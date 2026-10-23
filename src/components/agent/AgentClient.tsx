'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  AlertCircle,
  ArrowUp,
  Bot,
  Braces,
  CheckCircle2,
  ChevronDown,
  FileText,
  Loader2,
  MessageSquarePlus,
  RefreshCw,
  Sparkles,
  Terminal,
  Trash2,
  User,
  Wrench,
  XCircle,
} from 'lucide-react';
import type { AgentMessage, AgentSession, AgentToolLog, AgentMode } from '@/db/schema';
import { api } from '@/lib/api';
import { relativeTime } from '@/lib/date';
import { useUiStore } from '@/store/ui';
import { Button } from '@/components/ui/Button';
import { Switch } from '@/components/ui/Input';
import { Segmented } from '@/components/ui/Segmented';
import { VirtualList } from '@/components/ui/VirtualList';
import { EmptyState } from '@/components/ui/EmptyState';
import { MarkdownView } from '@/components/editor/MarkdownView';
import { toast } from '@/components/ui/Toast';

type SessionMeta = Pick<
  AgentSession,
  'id' | 'title' | 'mode' | 'model' | 'messageCount' | 'updatedAt' | 'lastMessageAt'
>;

type ConnState = { ok: boolean; baseUrl: string; models: string[]; error?: string };

type ToolExecView = {
  toolName: string;
  args: Record<string, unknown>;
  status: 'ok' | 'error';
  error?: string;
  durationMs: number;
  content: string;
};

const SUGGESTIONS = [
  '帮我看下进行中的灵感有哪些',
  '今天还有哪些待办没完成',
  '把这周的任务按优先级排一下',
  '根据今天的完成情况生成复盘草稿',
];

/**
 * 内嵌 Agent 面板（方案 A）
 * 左：会话列表（虚拟滚动） / 中：对话 / 右：工具调用日志
 */
export function AgentClient() {
  const params = useSearchParams();
  const draft = useUiStore((s) => s.agentDraft);
  const clearDraft = useUiStore((s) => s.clearAgentDraft);

  const [sessions, setSessions] = useState<SessionMeta[]>([]);
  const [activeId, setActiveId] = useState<string | null>(params.get('session'));
  const [session, setSession] = useState<AgentSession | null>(null);
  const [logs, setLogs] = useState<AgentToolLog[]>([]);
  const [liveTools, setLiveTools] = useState<ToolExecView[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [mode, setMode] = useState<AgentMode>('workbench');
  const [model, setModel] = useState('');
  const [conn, setConn] = useState<ConnState | null>(null);
  const [checking, setChecking] = useState(true);
  const [showLogs, setShowLogs] = useState(true);
  const [loadingSession, setLoadingSession] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  /* ------------------------------ 初始化 ------------------------------ */
  const checkConn = useCallback(async () => {
    setChecking(true);
    try {
      const res = await api.get<ConnState>('/api/agent/models');
      setConn(res);
      setModel((prev) => prev || res.models[0] || '');
    } catch (err) {
      setConn({
        ok: false,
        baseUrl: 'http://127.0.0.1:1234/v1',
        models: [],
        error: err instanceof Error ? err.message : '连接失败',
      });
    } finally {
      setChecking(false);
    }
  }, []);

  const loadSessions = useCallback(async () => {
    try {
      const rows = await api.get<SessionMeta[]>('/api/agent/sessions');
      setSessions(rows);
      return rows;
    } catch {
      return [];
    }
  }, []);

  const loadSession = useCallback(async (id: string) => {
    setLoadingSession(true);
    try {
      const res = await api.get<{ session: AgentSession; toolLogs: AgentToolLog[] }>(
        `/api/agent/sessions/${id}`,
      );
      setSession(res.session);
      setLogs(res.toolLogs);
      setMode(res.session.mode);
      if (res.session.model) setModel(res.session.model);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '加载会话失败');
    } finally {
      setLoadingSession(false);
    }
  }, []);

  useEffect(() => {
    void checkConn();
    void loadSessions();
  }, [checkConn, loadSessions]);

  useEffect(() => {
    if (activeId) void loadSession(activeId);
  }, [activeId, loadSession]);

  // 右键选中的文本带过来
  useEffect(() => {
    if (!draft) return;
    setInput((prev) =>
      `${prev ? `${prev}\n\n` : ''}请帮我处理下面这段内容：\n\n${draft.text}`.trim(),
    );
    clearDraft();
    setTimeout(() => textareaRef.current?.focus(), 50);
  }, [draft, clearDraft]);

  // 新消息滚动到底
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [session?.messages, sending]);

  const messages: AgentMessage[] = useMemo(
    () => (Array.isArray(session?.messages) ? session.messages : []),
    [session],
  );

  /* ------------------------------ 操作 ------------------------------ */
  const newSession = async () => {
    try {
      const row = await api.post<AgentSession>('/api/agent/sessions', { mode });
      setSessions((prev) => [
        {
          id: row.id,
          title: row.title,
          mode: row.mode,
          model: row.model,
          messageCount: 0,
          updatedAt: row.updatedAt,
          lastMessageAt: null,
        },
        ...prev,
      ]);
      setActiveId(row.id);
      setSession(row);
      setLogs([]);
      setLiveTools([]);
      textareaRef.current?.focus();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '创建会话失败');
    }
  };

  const removeSession = async (id: string) => {
    try {
      await api.del(`/api/agent/sessions/${id}`);
      setSessions((prev) => prev.filter((s) => s.id !== id));
      if (activeId === id) {
        setActiveId(null);
        setSession(null);
        setLogs([]);
      }
    } catch {
      toast.error('删除失败');
    }
  };

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;

    setSending(true);
    setLiveTools([]);

    // 乐观插入用户消息
    const optimistic: AgentMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
      createdAt: Date.now(),
    };
    setSession((prev) =>
      prev
        ? { ...prev, messages: [...(prev.messages ?? []), optimistic] }
        : prev,
    );
    setInput('');

    try {
      const res = await api.post<{
        sessionId: string;
        title: string;
        model: string;
        messages: AgentMessage[];
        assistantText: string;
        toolExecutions: ToolExecView[];
        steps: number;
      }>('/api/agent/chat', {
        sessionId: activeId ?? undefined,
        message: text,
        mode,
        model: model || undefined,
      });

      setLiveTools(res.toolExecutions);
      setActiveId(res.sessionId);
      setSession((prev) => ({
        id: res.sessionId,
        title: res.title,
        mode,
        model: res.model,
        status: 'active',
        messages: res.messages,
        messageCount: res.messages.length,
        lastMessageAt: new Date(),
        createdAt: prev?.createdAt ?? new Date(),
        updatedAt: new Date(),
      }));

      // 刷新会话列表与日志
      void loadSessions();
      const detail = await api.get<{ session: AgentSession; toolLogs: AgentToolLog[] }>(
        `/api/agent/sessions/${res.sessionId}`,
      );
      setLogs(detail.toolLogs);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '发送失败');
      // 回滚乐观消息
      setSession((prev) =>
        prev
          ? { ...prev, messages: (prev.messages ?? []).filter((m) => m.id !== optimistic.id) }
          : prev,
      );
      setInput(text);
    } finally {
      setSending(false);
    }
  };

  const toggleMode = async (next: AgentMode) => {
    setMode(next);
    if (activeId) {
      try {
        await api.patch(`/api/agent/sessions/${activeId}`, { mode: next });
      } catch {
        /* 忽略 */
      }
    }
    if (next === 'files') {
      toast.info('已开启文件读取：仅限 ai-material 目录内的 md/json/txt');
    }
  };

  /* ------------------------------ 渲染 ------------------------------ */
  return (
    <div className="flex h-full">
      {/* 会话列表 */}
      <aside className="flex w-[224px] shrink-0 flex-col border-r border-[var(--border-soft)] bg-paper-card">
        <div className="flex h-11 items-center justify-between border-b border-[var(--border-soft)] px-3">
          <span className="text-xs font-medium text-ink-700">
            会话 <span className="text-ink-500">{sessions.length}</span>
          </span>
          <Button size="icon" variant="ghost" onClick={() => void newSession()} title="新建会话">
            <MessageSquarePlus size={15} />
          </Button>
        </div>

        <VirtualList
          items={sessions}
          itemHeight={62}
          className="min-h-0 flex-1 p-1.5"
          empty={
            <div className="px-2 py-8 text-center text-[11px] leading-5 text-ink-500">
              还没有会话
              <br />
              点右上角 + 开始
            </div>
          }
          renderItem={(s) => (
            <div className="pb-0.5 pr-0.5">
              <button
                onClick={() => setActiveId(s.id)}
                className={`group flex h-[58px] w-full flex-col justify-center rounded-lg px-2.5 text-left transition-colors ${
                  activeId === s.id ? 'bg-brand-50' : 'hover:bg-brand-50/60'
                }`}
              >
                <div className="flex items-center gap-1">
                  <span className="truncate text-[12.5px] font-medium text-ink-900">
                    {s.title}
                  </span>
                  {s.mode === 'files' && <FileText size={10} className="shrink-0 text-brand-400" />}
                </div>
                <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-ink-500">
                  <span>{s.messageCount} 条</span>
                  <span>·</span>
                  <span>{relativeTime(s.lastMessageAt ?? s.updatedAt)}</span>
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      void removeSession(s.id);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.stopPropagation();
                        void removeSession(s.id);
                      }
                    }}
                    className="ml-auto rounded p-0.5 opacity-0 transition-opacity hover:text-status-abandoned group-hover:opacity-100"
                  >
                    <Trash2 size={11} />
                  </span>
                </div>
              </button>
            </div>
          )}
        />
      </aside>

      {/* 对话区 */}
      <section className="flex min-w-0 flex-1 flex-col bg-paper">
        {/* 顶部工具条 */}
        <div className="flex h-11 shrink-0 items-center gap-2 border-b border-[var(--border-soft)] bg-paper-card px-3">
          <Bot size={15} className="text-brand-500" />
          <span className="text-xs font-medium text-ink-900">工作台助手</span>

          <Segmented
            className="ml-2"
            value={mode}
            onChange={(v) => void toggleMode(v)}
            options={[
              { value: 'workbench', label: '工作台助手' },
              { value: 'files', label: '文件读取' },
            ]}
          />

          <div className="ml-auto flex items-center gap-2">
            {/* 连接状态 */}
            <span
              className={`flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] ${
                checking
                  ? 'bg-brand-50 text-ink-500'
                  : conn?.ok
                    ? 'bg-status-done/10 text-status-done'
                    : 'bg-status-abandoned/10 text-status-abandoned'
              }`}
            >
              {checking ? (
                <Loader2 size={9} className="animate-spin" />
              ) : conn?.ok ? (
                <CheckCircle2 size={9} />
              ) : (
                <AlertCircle size={9} />
              )}
              {checking ? '检测中' : conn?.ok ? 'LM Studio 已连接' : 'LM Studio 未连接'}
            </span>

            {conn?.models?.length ? (
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="h-7 max-w-[180px] rounded-md border border-[var(--border-soft)] bg-paper px-1.5 text-[11px] text-ink-700"
              >
                {conn.models.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            ) : null}

            <Button size="icon" variant="ghost" onClick={() => void checkConn()} title="重新检测">
              <RefreshCw size={13} className={checking ? 'animate-spin' : ''} />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setShowLogs((v) => !v)}
              title="工具日志"
            >
              <Terminal size={14} className={showLogs ? 'text-brand-500' : ''} />
            </Button>
          </div>
        </div>

        {/* 连接失败提示 */}
        {!checking && conn && !conn.ok && (
          <div className="mx-3 mt-2 flex items-start gap-2 rounded-lg border border-status-abandoned/20 bg-status-abandoned/5 px-3 py-2 text-[11px] leading-5 text-ink-700">
            <AlertCircle size={13} className="mt-0.5 shrink-0 text-status-abandoned" />
            <div>
              <p className="font-medium text-status-abandoned">无法连接本地模型服务</p>
              <p className="mt-0.5 text-ink-500">
                请先启动 LM Studio → 加载 DeepSeek 模型 → 在 Developer 页开启本地服务（
                {conn.baseUrl}）。本应用不会使用任何云端 API。
              </p>
            </div>
          </div>
        )}

        {/* 消息区 */}
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {loadingSession && (
            <div className="flex items-center justify-center gap-2 py-8 text-xs text-ink-500">
              <Loader2 size={13} className="animate-spin" /> 加载会话…
            </div>
          )}

          {!loadingSession && messages.length === 0 && (
            <div className="mx-auto max-w-lg pt-10 text-center">
              <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-brand-500 text-white">
                <Sparkles size={20} />
              </div>
              <h2 className="mt-3 text-sm font-semibold text-ink-900">内嵌工作台助手</h2>
              <p className="mt-1 text-xs leading-5 text-ink-500">
                基于本地 LM Studio + DeepSeek，可通过 function calling 直接读写你的灵感、待办、复盘。
                <br />
                数据不出本机。
              </p>
              <div className="mt-4 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => setInput(s)}
                    className="rounded-lg border border-[var(--border-soft)] bg-paper-card px-3 py-2 text-left text-[12px] text-ink-700 transition-colors hover:border-brand-200 hover:bg-brand-50/50"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mx-auto max-w-3xl space-y-3">
            {messages.map((m) => {
              if (m.role === 'user') {
                return (
                  <div key={m.id} className="flex justify-end gap-2">
                    <div className="max-w-[80%] rounded-xl rounded-br-sm bg-brand-500 px-3.5 py-2 text-[13px] leading-6 text-white">
                      <p className="whitespace-pre-wrap break-words">{m.content}</p>
                    </div>
                    <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-600">
                      <User size={12} />
                    </div>
                  </div>
                );
              }

              if (m.role === 'tool') {
                return (
                  <div key={m.id} className="flex items-center gap-1.5 pl-1 text-[10.5px] text-ink-500">
                    <Wrench size={10} className="text-brand-400" />
                    工具 <span className="font-mono">{m.toolName}</span> 已返回结果
                  </div>
                );
              }

              if (m.role === 'assistant' && m.toolCalls?.length) {
                return (
                  <div key={m.id} className="flex flex-wrap items-center gap-1.5 pl-1">
                    {m.toolCalls.map((tc) => (
                      <span
                        key={tc.id}
                        className="inline-flex items-center gap-1 rounded-md bg-brand-50 px-1.5 py-0.5 text-[10px] text-brand-600"
                      >
                        <Wrench size={9} />
                        {tc.name}
                      </span>
                    ))}
                    {m.content && (
                      <div className="mt-1 w-full">
                        <MarkdownView source={m.content} />
                      </div>
                    )}
                  </div>
                );
              }

              return (
                <div key={m.id} className="flex gap-2">
                  <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-500 text-white">
                    <Bot size={12} />
                  </div>
                  <div className="min-w-0 flex-1 rounded-xl rounded-bl-sm border border-[var(--border-soft)] bg-paper-card px-3.5 py-2 shadow-card">
                    <MarkdownView source={m.content} />
                  </div>
                </div>
              );
            })}

            {sending && (
              <div className="flex items-center gap-2 pl-1 text-[11px] text-ink-500">
                <Loader2 size={12} className="animate-spin text-brand-400" />
                正在思考并调用工具…
              </div>
            )}
          </div>
        </div>

        {/* 输入区 */}
        <div className="shrink-0 border-t border-[var(--border-soft)] bg-paper-card px-3 py-2.5">
          <div className="mx-auto max-w-3xl">
            <div className="flex items-end gap-2 rounded-xl border border-[var(--border-strong)] bg-paper px-2.5 py-1.5 focus-within:border-brand-400">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
                rows={1}
                placeholder="问点什么，或让我直接改数据…（Enter 发送，Shift+Enter 换行）"
                className="max-h-32 min-h-[28px] flex-1 resize-none bg-transparent py-1 text-[13px] leading-6 text-ink-900 outline-none placeholder:text-ink-500/70"
              />
              <Button
                size="icon"
                variant="primary"
                onClick={() => void send()}
                disabled={!input.trim() || sending}
                title="发送"
              >
                {sending ? <Loader2 size={14} className="animate-spin" /> : <ArrowUp size={15} />}
              </Button>
            </div>
            <div className="mt-1 flex items-center gap-3 px-1 text-[10px] text-ink-500">
              <span className="flex items-center gap-1">
                <Braces size={9} /> {mode === 'files' ? '已允许读取素材文件' : '仅工作台数据'}
              </span>
              <span>· 所有会话与工具调用均写入本地 SQLite</span>
              <span className="ml-auto">{model || '未选择模型'}</span>
            </div>
          </div>
        </div>
      </section>

      {/* 工具日志面板 */}
      {showLogs && (
        <aside className="flex w-[290px] shrink-0 flex-col border-l border-[var(--border-soft)] bg-paper-card">
          <div className="flex h-11 items-center gap-1.5 border-b border-[var(--border-soft)] px-3">
            <Terminal size={13} className="text-brand-400" />
            <span className="text-xs font-medium text-ink-700">工具调用审计</span>
            <span className="text-[10px] text-ink-500">{logs.length}</span>
          </div>

          <div className="border-b border-[var(--border-soft)] px-3 py-2">
            <Switch
              checked={mode === 'files'}
              onChange={(v) => void toggleMode(v ? 'files' : 'workbench')}
              label="允许读取素材文件"
              desc="白名单：public/assets/ai-material 下的 md/json/txt，只读"
            />
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {/* 本轮实时执行 */}
            {liveTools.length > 0 && (
              <div className="mb-2">
                <p className="px-1 py-1 text-[10px] font-medium uppercase tracking-wide text-ink-500">
                  本轮执行
                </p>
                {liveTools.map((t, i) => (
                  <div
                    key={`${t.toolName}-${i}`}
                    className="mb-1 rounded-lg border border-brand-200 bg-brand-50/50 px-2 py-1.5"
                  >
                    <div className="flex items-center gap-1">
                      {t.status === 'ok' ? (
                        <CheckCircle2 size={10} className="text-status-done" />
                      ) : (
                        <XCircle size={10} className="text-status-abandoned" />
                      )}
                      <span className="font-mono text-[11px] text-ink-900">{t.toolName}</span>
                      <span className="ml-auto text-[9px] text-ink-500">{t.durationMs}ms</span>
                    </div>
                    <pre className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap break-all text-[10px] leading-4 text-ink-500">
                      {t.content}
                    </pre>
                  </div>
                ))}
              </div>
            )}

            {/* 历史日志 */}
            {logs.length === 0 && liveTools.length === 0 && (
              <EmptyState compact icon={<Terminal size={20} />} title="暂无工具调用" />
            )}

            {logs
              .slice()
              .reverse()
              .map((log) => (
                <details
                  key={log.id}
                  className="mb-1 rounded-lg border border-[var(--border-soft)] bg-paper px-2 py-1.5"
                >
                  <summary className="flex cursor-pointer list-none items-center gap-1">
                    {log.status === 'ok' ? (
                      <CheckCircle2 size={10} className="text-status-done" />
                    ) : (
                      <XCircle size={10} className="text-status-abandoned" />
                    )}
                    <span className="font-mono text-[11px] text-ink-900">{log.toolName}</span>
                    <span className="ml-auto flex items-center gap-1 text-[9px] text-ink-500">
                      {log.durationMs}ms
                      <ChevronDown size={9} />
                    </span>
                  </summary>
                  <div className="mt-1 space-y-1">
                    <p className="text-[9px] text-ink-500">{relativeTime(log.createdAt)}</p>
                    <div>
                      <p className="text-[9px] font-medium text-ink-500">参数</p>
                      <pre className="max-h-20 overflow-auto whitespace-pre-wrap break-all rounded bg-paper-card p-1 font-mono text-[9.5px] leading-4 text-ink-700">
                        {log.args ?? '{}'}
                      </pre>
                    </div>
                    <div>
                      <p className="text-[9px] font-medium text-ink-500">
                        {log.status === 'ok' ? '结果' : '错误'}
                      </p>
                      <pre className="max-h-28 overflow-auto whitespace-pre-wrap break-all rounded bg-paper-card p-1 font-mono text-[9.5px] leading-4 text-ink-700">
                        {log.status === 'ok' ? log.result : log.error}
                      </pre>
                    </div>
                  </div>
                </details>
              ))}
          </div>

          <div className="border-t border-[var(--border-soft)] px-3 py-2 text-[10px] leading-4 text-ink-500">
            共 9 个工具 · 当前模式可用 {mode === 'files' ? 9 : 8} 个
            <br />
            禁止 shell 执行与任意路径读写
          </div>
        </aside>
      )}
    </div>
  );
}
