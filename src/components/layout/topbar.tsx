'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckSquare, Frame, Lightbulb, Plus, Search } from 'lucide-react';
import { useUIStore } from '@/store/ui';
import { cn, isMac } from '@/lib/utils';
import { ThemeToggle } from './theme-toggle';

/** 顶部栏：全局搜索入口 + 快捷新建 + 明暗切换 */
export function Topbar() {
  const openSearch = useUIStore((s) => s.openSearch);
  const router = useRouter();

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [modKey, setModKey] = useState('Ctrl');

  useEffect(() => {
    setModKey(isMac() ? '⌘' : 'Ctrl');
  }, []);

  // 点击外部关闭新建菜单
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [menuOpen]);

  const create = (href: string) => {
    setMenuOpen(false);
    router.push(href);
  };

  return (
    <header className="flex h-topbar shrink-0 items-center justify-between gap-3 border-b border-line bg-app px-4">
      {/* 搜索入口（点击或 Ctrl+K 唤起真实搜索面板） */}
      <button
        type="button"
        onClick={openSearch}
        className="group flex h-7 w-full max-w-[320px] items-center gap-2 rounded-md border border-line bg-app-panel px-2.5 text-left text-xs text-ink-muted transition-colors hover:border-line-strong hover:text-ink-secondary"
      >
        <Search className="h-3.5 w-3.5 shrink-0" />
        <span className="flex-1 truncate">搜索一切…</span>
        <kbd className="shrink-0 rounded-sm border border-line bg-app px-1 py-0.5 text-[10px] text-ink-muted">
          {modKey} K
        </kbd>
      </button>

      <div className="flex shrink-0 items-center gap-1">
        {/* 新建 */}
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className={cn(
              'flex h-7 items-center gap-1 rounded-md border border-line px-2 text-xs transition-colors',
              menuOpen
                ? 'bg-app-active text-ink'
                : 'text-ink-secondary hover:bg-app-hover hover:text-ink',
            )}
          >
            <Plus className="h-3.5 w-3.5" />
            新建
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-[calc(100%+6px)] z-40 w-[168px] overflow-hidden rounded-md border border-line bg-app py-1 shadow-float animate-slide-up">
              <MenuItem
                icon={<CheckSquare className="h-3.5 w-3.5" />}
                label="待办"
                hint={`${modKey} T`}
                onClick={() => create('/todo?new=1')}
              />
              <MenuItem
                icon={<Lightbulb className="h-3.5 w-3.5" />}
                label="灵感"
                hint={`${modKey} N`}
                onClick={() => create('/inspiration?new=1')}
              />
              <MenuItem
                icon={<Frame className="h-3.5 w-3.5" />}
                label="画布"
                onClick={() => create('/canvas?new=1')}
              />
            </div>
          )}
        </div>

        <ThemeToggle />
      </div>
    </header>
  );
}

function MenuItem({
  icon,
  label,
  hint,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  hint?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs text-ink-secondary transition-colors hover:bg-app-hover hover:text-ink"
    >
      <span className="text-ink-muted">{icon}</span>
      <span className="flex-1">{label}</span>
      {hint && <span className="text-[10px] text-ink-muted">{hint}</span>}
    </button>
  );
}
