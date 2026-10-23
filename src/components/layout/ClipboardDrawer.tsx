'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ClipboardList,
  Copy,
  Lightbulb,
  Pin,
  PinOff,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-react';
import type { ClipboardSnapshot } from '@/db/schema';
import { api } from '@/lib/api';
import { CLIPBOARD_TYPE_LABEL } from '@/lib/constants';
import { relativeTime } from '@/lib/date';
import { truncate } from '@/lib/utils';
import { useUiStore } from '@/store/ui';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Switch } from '@/components/ui/Input';
import { toast } from '@/components/ui/Toast';
import {
  isClipboardCaptureEnabled,
  setClipboardCaptureEnabled,
} from './ClipboardCapture';

/** 右侧剪贴板抽屉 */
export function ClipboardDrawer() {
  const open = useUiStore((s) => s.clipboardOpen);
  const setOpen = useUiStore((s) => s.setClipboardOpen);
  const router = useRouter();

  const [items, setItems] = useState<ClipboardSnapshot[]>([]);
  const [loading, setLoading] = useState(false);
  const [captureOn, setCaptureOn] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await api.get<ClipboardSnapshot[]>('/api/clipboard?limit=80');
      setItems(rows);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setCaptureOn(isClipboardCaptureEnabled());
    void load();
  }, [open, load]);

  if (!open) return null;

  const toInspiration = async (id: string) => {
    try {
      const row = await api.post<{ id: string }>(`/api/clipboard/${id}/to-inspiration`);
      toast.success('已转为灵感条目');
      setOpen(false);
      router.push(`/inspiration?id=${row.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '操作失败');
    }
  };

  const togglePin = async (item: ClipboardSnapshot) => {
    try {
      await api.patch(`/api/clipboard/${item.id}`, { isPinned: !item.isPinned });
      void load();
    } catch {
      toast.error('操作失败');
    }
  };

  const remove = async (id: string) => {
    try {
      await api.del(`/api/clipboard/${id}`);
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch {
      toast.error('删除失败');
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="flex-1 bg-brand-900/20" onClick={() => setOpen(false)} />
      <aside className="flex h-full w-[380px] animate-fade-in flex-col border-l border-[var(--border-soft)] bg-paper-card shadow-float">
        <div className="flex h-14 items-center justify-between border-b border-[var(--border-soft)] px-4">
          <div className="flex items-center gap-2">
            <ClipboardList size={16} className="text-brand-400" />
            <h2 className="text-sm font-semibold text-ink-900">剪贴板快照</h2>
            <span className="text-[11px] text-ink-500">{items.length}</span>
          </div>
          <div className="flex items-center gap-1">
            <Button size="icon" variant="ghost" onClick={() => void load()} title="刷新">
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </Button>
            <Button size="icon" variant="ghost" onClick={() => setOpen(false)}>
              <X size={15} />
            </Button>
          </div>
        </div>

        <div className="border-b border-[var(--border-soft)] px-4 py-2">
          <Switch
            checked={captureOn}
            onChange={(v) => {
              setCaptureOn(v);
              setClipboardCaptureEnabled(v);
              toast.info(v ? '已开启复制捕获' : '已关闭复制捕获');
            }}
            label="后台捕获复制内容"
            desc="仅捕获页面内的复制/粘贴，数据写入本地 SQLite"
          />
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {items.length === 0 && !loading && (
            <EmptyState
              icon={<ClipboardList size={28} />}
              title="还没有快照"
              desc="在任意页面复制一段文本，就会自动出现在这里"
            />
          )}

          <div className="space-y-2">
            {items.map((item) => (
              <div
                key={item.id}
                className="group rounded-lg border border-[var(--border-soft)] bg-paper px-3 py-2 transition-colors hover:border-brand-200"
              >
                <div className="flex items-center gap-1.5 text-[10px] text-ink-500">
                  <span className="rounded bg-brand-50 px-1 text-brand-600">
                    {CLIPBOARD_TYPE_LABEL[item.contentType] ?? item.contentType}
                  </span>
                  <span>{relativeTime(item.createdAt)}</span>
                  <span>· {item.charCount} 字</span>
                  {item.inspirationId && (
                    <span className="ml-auto text-status-done">已入库</span>
                  )}
                </div>
                <p className="mt-1 whitespace-pre-wrap break-words text-[12.5px] leading-5 text-ink-700">
                  {truncate(item.content, 220)}
                </p>
                <div className="mt-1.5 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <Button
                    size="sm"
                    variant="subtle"
                    onClick={() => void toInspiration(item.id)}
                  >
                    <Lightbulb size={12} /> 新建灵感
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      void navigator.clipboard.writeText(item.content);
                      toast.success('已复制');
                    }}
                  >
                    <Copy size={12} />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => void togglePin(item)}>
                    {item.isPinned ? <PinOff size={12} /> : <Pin size={12} />}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => void remove(item.id)}>
                    <Trash2 size={12} className="text-status-abandoned" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="border-t border-[var(--border-soft)] px-4 py-2.5">
          <Button
            size="sm"
            variant="ghost"
            className="w-full justify-center text-status-abandoned"
            onClick={async () => {
              try {
                await api.del('/api/clipboard');
                toast.success('已清空未置顶快照');
                void load();
              } catch {
                toast.error('清空失败');
              }
            }}
          >
            <Trash2 size={13} /> 清空未置顶
          </Button>
        </div>
      </aside>
    </div>
  );
}
