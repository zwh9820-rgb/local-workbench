'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { FolderOpen, Maximize2, MousePointerSquareDashed, RefreshCw, TerminalSquare } from 'lucide-react';
import { installDesktopContextMenuGuard, isTauri, openExternal, revealDataDir } from '@/lib/desktop';

type MenuState = { x: number; y: number } | null;

/**
 * 桌面壳增强（只在 Tauri 窗口里真正生效，浏览器里是空组件）
 *
 * 1. 屏蔽 WebView 默认右键菜单，换成应用自己的菜单
 * 2. 外部链接（http/https 且非同源）交给系统浏览器打开，避免窗口被导航走
 * 3. 选区右键仍由 SelectionAgentMenu 接管（有选区时不抢）
 */
export function DesktopShell() {
  const [menu, setMenu] = useState<MenuState>(null);
  const [desktop, setDesktop] = useState(false);

  useEffect(() => {
    setDesktop(isTauri());
  }, []);

  useEffect(() => {
    if (!desktop) return;

    const removeGuard = installDesktopContextMenuGuard();

    const onContextMenu = (e: MouseEvent) => {
      const selection = window.getSelection()?.toString().trim() ?? '';
      if (selection) return; // 有选区 → 交给「发送给 Agent」菜单
      e.preventDefault();
      setMenu({ x: e.clientX, y: e.clientY });
    };

    // 外部链接走系统浏览器
    const onClick = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement | null)?.closest?.('a[href]') as
        | HTMLAnchorElement
        | null;
      if (!anchor) return;
      const href = anchor.getAttribute('href') ?? '';
      if (!/^https?:\/\//i.test(href)) return;
      try {
        const url = new URL(href, window.location.href);
        if (url.origin === window.location.origin) return;
        e.preventDefault();
        void openExternal(url.toString());
      } catch {
        /* 忽略非法 URL */
      }
    };

    const close = () => setMenu(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenu(null);
    };

    document.addEventListener('contextmenu', onContextMenu);
    document.addEventListener('click', onClick);
    document.addEventListener('click', close);
    document.addEventListener('scroll', close, true);
    document.addEventListener('keydown', onKey);

    return () => {
      removeGuard();
      document.removeEventListener('contextmenu', onContextMenu);
      document.removeEventListener('click', onClick);
      document.removeEventListener('click', close);
      document.removeEventListener('scroll', close, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [desktop]);

  if (!desktop || !menu) return null;

  const left = Math.min(menu.x, window.innerWidth - 190);
  const top = Math.min(menu.y, window.innerHeight - 170);

  return (
    <div
      style={{ left, top }}
      className="fixed z-[80] w-[176px] animate-fade-in overflow-hidden rounded-lg border border-[var(--border-soft)] bg-paper-card py-1 shadow-float"
      onClick={(e) => e.stopPropagation()}
    >
      <MenuItem
        icon={<MousePointerSquareDashed size={12} />}
        label="全选当前页"
        onClick={() => {
          document.execCommand('selectAll');
          setMenu(null);
        }}
      />
      <MenuItem
        icon={<RefreshCw size={12} />}
        label="刷新界面"
        onClick={() => {
          window.location.reload();
        }}
      />
      <MenuItem
        icon={<FolderOpen size={12} />}
        label="打开数据目录"
        onClick={() => {
          void revealDataDir();
          setMenu(null);
        }}
      />
      <div className="my-1 h-px bg-[var(--border-soft)]" />
      <MenuItem
        icon={<Maximize2 size={12} />}
        label="切换全屏"
        onClick={() => {
          if (document.fullscreenElement) void document.exitFullscreen();
          else void document.documentElement.requestFullscreen();
          setMenu(null);
        }}
      />
      <MenuItem
        icon={<TerminalSquare size={12} />}
        label="开发者工具"
        hint="Ctrl Shift I"
        onClick={() => {
          // Tauri v2 默认屏蔽 devtools 快捷键，这里用窗口事件放行
          window.dispatchEvent(new CustomEvent('wb:toggle-devtools'));
          setMenu(null);
        }}
      />
    </div>
  );
}

function MenuItem({
  icon,
  label,
  hint,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  hint?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[12.5px] text-ink-700 transition-colors hover:bg-brand-50"
    >
      <span className="text-brand-500">{icon}</span>
      <span className="flex-1">{label}</span>
      {hint && <span className="text-[9px] text-ink-500">{hint}</span>}
    </button>
  );
}
