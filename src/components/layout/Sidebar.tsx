'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { PanelLeftClose, PanelLeftOpen, Sparkles } from 'lucide-react';
import { NAV_ITEMS } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { useUiStore } from '@/store/ui';

/** 左侧固定侧边栏 */
export function Sidebar() {
  const pathname = usePathname();
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggle = useUiStore((s) => s.toggleSidebar);

  return (
    <aside
      className={cn(
        'flex shrink-0 flex-col border-r border-[var(--border-soft)] bg-paper-card transition-[width] duration-200',
        collapsed ? 'w-[62px]' : 'w-[212px]',
      )}
    >
      {/* Logo */}
      <div className="flex h-14 items-center gap-2 px-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-500 text-white">
          <Sparkles size={16} />
        </div>
        {!collapsed && (
          <div className="min-w-0 leading-tight">
            <p className="truncate text-[13px] font-semibold text-ink-900">本地工作台</p>
            <p className="truncate text-[10px] text-ink-500">Local Workbench</p>
          </div>
        )}
      </div>

      {/* 导航 */}
      <nav className="mt-1 flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
        {NAV_ITEMS.map((item) => {
          const active =
            item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              data-active={active}
              className={cn('wb-nav-item', collapsed && 'justify-center px-0')}
            >
              <Icon size={16} className="shrink-0" />
              {!collapsed && (
                <>
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.hint && (
                    <span
                      className={cn(
                        'rounded px-1 py-0.5 text-[9px] font-medium',
                        active ? 'bg-white/15 text-white' : 'bg-brand-50 text-brand-400',
                      )}
                    >
                      {item.hint}
                    </span>
                  )}
                </>
              )}
            </Link>
          );
        })}
      </nav>

      {/* 底部：折叠 + 本地标识 */}
      <div className="border-t border-[var(--border-soft)] p-2">
        {!collapsed && (
          <div className="mb-2 rounded-lg bg-brand-50/70 px-2 py-1.5">
            <p className="text-[10px] font-medium text-brand-600">数据全部本地存储</p>
            <p className="mt-0.5 text-[10px] text-ink-500">SQLite · 不上云</p>
          </div>
        )}
        <button
          onClick={toggle}
          className={cn(
            'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-ink-500 transition-colors hover:bg-brand-50 hover:text-brand-700',
            collapsed && 'justify-center px-0',
          )}
          title={collapsed ? '展开侧边栏' : '收起侧边栏'}
        >
          {collapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
          {!collapsed && <span>收起</span>}
        </button>
      </div>
    </aside>
  );
}
