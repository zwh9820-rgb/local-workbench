'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bot, Lightbulb, X } from 'lucide-react';
import { api } from '@/lib/api';
import { truncate } from '@/lib/utils';
import { useUiStore } from '@/store/ui';
import { toast } from '@/components/ui/Toast';

type MenuState = { x: number; y: number; text: string } | null;

/**
 * 选中文本 → 右键「发送给 Agent」。
 * 只处理有选区的右键，不影响正常右键菜单。
 */
export function SelectionAgentMenu() {
  const [menu, setMenu] = useState<MenuState>(null);
  const router = useRouter();
  const sendSelectionToAgent = useUiStore((s) => s.sendSelectionToAgent);

  useEffect(() => {
    const onContextMenu = (e: MouseEvent) => {
      const text = window.getSelection()?.toString().trim() ?? '';
      if (!text || text.length < 2) return; // 没有选中就保留原生菜单
      e.preventDefault();
      setMenu({ x: e.clientX, y: e.clientY, text: text.slice(0, 4000) });
    };
    const close = () => setMenu(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenu(null);
    };

    document.addEventListener('contextmenu', onContextMenu);
    document.addEventListener('click', close);
    document.addEventListener('scroll', close, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('contextmenu', onContextMenu);
      document.removeEventListener('click', close);
      document.removeEventListener('scroll', close, true);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  if (!menu) return null;

  const toAgent = () => {
    sendSelectionToAgent(menu.text);
    setMenu(null);
    router.push('/agent');
  };

  const toInspiration = async () => {
    try {
      await api.post('/api/inspiration', {
        title: truncate(menu.text, 40) || '选中的片段',
        content: menu.text,
        summary: truncate(menu.text, 120),
        type: 'note',
        status: 'ongoing',
        tags: ['选中片段'],
      });
      toast.success('已存入灵感素材库');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存失败');
    }
    setMenu(null);
  };

  // 防止菜单超出视口
  const left = Math.min(menu.x, window.innerWidth - 200);
  const top = Math.min(menu.y, window.innerHeight - 100);

  return (
    <div
      style={{ left, top }}
      className="fixed z-[70] w-[184px] animate-fade-in overflow-hidden rounded-lg border border-[var(--border-soft)] bg-paper-card py-1 shadow-float"
    >
      <div className="flex items-center justify-between px-2.5 pb-1">
        <span className="text-[10px] text-ink-500">已选中 {menu.text.length} 字</span>
        <X size={10} className="cursor-pointer text-ink-500" onClick={() => setMenu(null)} />
      </div>
      <button
        onClick={toAgent}
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[13px] text-ink-700 hover:bg-brand-50"
      >
        <Bot size={13} className="text-brand-500" /> 发送给 Agent 处理
      </button>
      <button
        onClick={() => void toInspiration()}
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[13px] text-ink-700 hover:bg-brand-50"
      >
        <Lightbulb size={13} className="text-brand-500" /> 存入灵感库
      </button>
    </div>
  );
}
