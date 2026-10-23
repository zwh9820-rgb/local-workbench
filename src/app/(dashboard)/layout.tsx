import type { ReactNode } from 'react';
import { Sidebar } from '@/components/layout/Sidebar';
import { TopBar } from '@/components/layout/TopBar';
import { GlobalSearch } from '@/components/layout/GlobalSearch';
import { ClipboardDrawer } from '@/components/layout/ClipboardDrawer';
import { ClipboardCapture } from '@/components/layout/ClipboardCapture';
import { SelectionAgentMenu } from '@/components/layout/SelectionAgentMenu';
import { HotkeysProvider } from '@/components/layout/HotkeysProvider';
import { DesktopShell } from '@/components/desktop/DesktopShell';
import { Toaster } from '@/components/ui/Toast';

/**
 * (dashboard) 路由组统一布局：
 * 左侧固定侧边栏 + 顶部搜索栏 + 右侧主内容区（各页面自行滚动）
 */
export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden bg-paper">
      <Sidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
      </div>

      {/* 全局浮层 */}
      <GlobalSearch />
      <ClipboardDrawer />
      <SelectionAgentMenu />
      <DesktopShell />

      {/* 无渲染的逻辑组件 */}
      <HotkeysProvider />
      <ClipboardCapture />
      <Toaster />
    </div>
  );
}
