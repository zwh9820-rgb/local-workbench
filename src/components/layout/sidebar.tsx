'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { NAV_GROUPS, SETTINGS_NAV } from '@/lib/constants';
import { useUIStore } from '@/store/ui';
import { cn } from '@/lib/utils';

export function Sidebar() {
  const pathname = usePathname();
  const collapsed = useUIStore((s) => s.sidebarCollapsed);
  const toggle = useUIStore((s) => s.toggleSidebar);

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href);

  return (
    <aside
      className={cn(
        'flex h-full shrink-0 flex-col border-r border-line bg-app transition-[width] duration-200',
        collapsed ? 'w-[52px]' : 'w-sidebar',
      )}
    >
      {/* 品牌区 */}
      <div
        className={cn(
          'flex h-topbar shrink-0 items-center border-b border-line',
          collapsed ? 'justify-center px-0' : 'gap-2 px-3',
        )}
      >
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm bg-app-inverse text-[11px] font-bold text-ink-inverse">
          W
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <div className="truncate text-[13px] font-semibold leading-4 text-ink">
              内容工作台
            </div>
            <div className="truncate text-[10px] leading-3 text-ink-muted">
              Local AI Workbench
            </div>
          </div>
        )}
      </div>

      {/* 导航 */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden py-2 no-scrollbar">
        {NAV_GROUPS.map((group) => (
          <div key={group.title} className="mb-1">
            {!collapsed && (
              <div className="px-3 py-1 text-[10px] font-medium uppercase tracking-wider text-ink-muted">
                {group.title}
              </div>
            )}
            {group.items.map((item) => {
              const active = isActive(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={collapsed ? item.label : undefined}
                  className={cn(
                    'mx-1.5 mb-0.5 flex h-8 items-center rounded-md text-[13px] transition-colors',
                    collapsed ? 'justify-center px-0' : 'gap-2 px-2',
                    active
                      ? 'bg-app-active font-medium text-ink'
                      : 'text-ink-secondary hover:bg-app-hover hover:text-ink',
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
                  {!collapsed && (
                    <>
                      <span className="flex-1 truncate">{item.label}</span>
                      {item.hint && (
                        <span className="text-[10px] text-ink-muted">{item.hint}</span>
                      )}
                    </>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* 底部：设置 + 折叠 */}
      <div className="shrink-0 border-t border-line p-1.5">
        <Link
          href={SETTINGS_NAV.href}
          title={collapsed ? SETTINGS_NAV.label : undefined}
          className={cn(
            'mb-0.5 flex h-8 items-center rounded-md text-[13px] transition-colors',
            collapsed ? 'justify-center px-0' : 'gap-2 px-2',
            isActive(SETTINGS_NAV.href)
              ? 'bg-app-active font-medium text-ink'
              : 'text-ink-secondary hover:bg-app-hover hover:text-ink',
          )}
        >
          <SETTINGS_NAV.icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
          {!collapsed && <span>{SETTINGS_NAV.label}</span>}
        </Link>

        <button
          type="button"
          onClick={toggle}
          title={collapsed ? '展开侧边栏' : '收起侧边栏'}
          className={cn(
            'flex h-8 w-full items-center rounded-md text-[13px] text-ink-muted transition-colors hover:bg-app-hover hover:text-ink',
            collapsed ? 'justify-center px-0' : 'gap-2 px-2',
          )}
        >
          {collapsed ? (
            <PanelLeftOpen className="h-4 w-4" strokeWidth={1.75} />
          ) : (
            <>
              <PanelLeftClose className="h-4 w-4" strokeWidth={1.75} />
              <span>收起</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
