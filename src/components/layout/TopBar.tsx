'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  Bot,
  ClipboardList,
  Download,
  FolderOpen,
  Loader2,
  Search,
  Upload,
} from 'lucide-react';
import { NAV_ITEMS } from '@/lib/constants';
import { useUiStore } from '@/store/ui';
import { toast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import { exportBackup, importBackup } from '@/lib/desktop/backup';
import { isTauri, revealDataDir } from '@/lib/desktop';

/** 顶部栏：页面标题 + 全局搜索入口 + 快捷操作 */
export function TopBar() {
  const pathname = usePathname();
  const setSearchOpen = useUiStore((s) => s.setSearchOpen);
  const setClipboardOpen = useUiStore((s) => s.setClipboardOpen);

  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [desktop, setDesktop] = useState(false);

  // isTauri 依赖 window，放到挂载后判断，避免 SSR 不一致
  useEffect(() => setDesktop(isTauri()), []);

  const current =
    NAV_ITEMS.find((n) => (n.href === '/' ? pathname === '/' : pathname.startsWith(n.href))) ??
    NAV_ITEMS[0];

  /**
   * 导出备份：sqlite + 素材目录 → zip
   * Web：浏览器下载；Tauri：写 App 数据目录 + 系统「另存为」对话框
   */
  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await exportBackup();
      if (res.cancelled) {
        toast.info('已保存到应用备份目录，可在「数据目录」中查看');
      } else if (res.savedTo) {
        toast.success('备份已导出');
      } else {
        toast.success('备份已导出');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '导出失败');
    } finally {
      setExporting(false);
    }
  };

  /** 导入备份：Tauri 走系统「打开」对话框，Web 走文件选择框 */
  const handleImport = async () => {
    setImporting(true);
    try {
      const result = await importBackup();
      if (!result) return; // 用户取消
      const tables = Object.keys(result.imported).length;
      toast.success(`导入完成：${tables} 张表 · ${result.materialFiles} 个素材文件`);
      setTimeout(() => window.location.reload(), 800);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '导入失败');
    } finally {
      setImporting(false);
    }
  };

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-[var(--border-soft)] bg-paper-card/80 px-4 backdrop-blur">
      <div className="flex min-w-0 items-center gap-2">
        <current.icon size={16} className="text-brand-400" />
        <h1 className="truncate text-sm font-semibold text-ink-900">{current.label}</h1>
        {desktop && (
          <span className="rounded bg-brand-50 px-1 py-0.5 text-[9px] font-medium text-brand-500">
            桌面版
          </span>
        )}
      </div>

      {/* 全局搜索触发 */}
      <button
        onClick={() => setSearchOpen(true)}
        className="group ml-2 flex h-8 flex-1 max-w-md items-center gap-2 rounded-lg border border-[var(--border-soft)] bg-paper px-2.5 text-left transition-colors hover:border-brand-200 hover:bg-brand-50/60"
      >
        <Search size={14} className="text-ink-500" />
        <span className="flex-1 truncate text-xs text-ink-500">搜索全站内容…</span>
        <kbd className="rounded border border-[var(--border-soft)] bg-paper-card px-1.5 py-0.5 text-[10px] text-ink-500">
          Ctrl K
        </kbd>
      </button>

      <div className="ml-auto flex items-center gap-1">
        {desktop && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void revealDataDir()}
            title="打开应用数据目录"
          >
            <FolderOpen size={15} />
          </Button>
        )}

        <Button
          size="sm"
          variant="ghost"
          onClick={() => setClipboardOpen(true)}
          title="剪贴板快照"
        >
          <ClipboardList size={15} />
          <span className="hidden sm:inline">剪贴板</span>
        </Button>

        <Button size="sm" variant="ghost" onClick={handleExport} disabled={exporting} title="导出备份">
          {exporting ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
          <span className="hidden sm:inline">备份</span>
        </Button>

        <Button
          size="sm"
          variant="ghost"
          onClick={handleImport}
          disabled={importing}
          title="导入备份"
        >
          {importing ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
          <span className="hidden sm:inline">导入</span>
        </Button>

        <Link
          href="/agent"
          className={cn(
            'ml-1 inline-flex h-8 items-center gap-1.5 rounded-lg bg-brand-500 px-2.5 text-[13px] font-medium text-white transition-colors hover:bg-brand-600',
          )}
        >
          <Bot size={15} />
          Agent
        </Link>
      </div>
    </header>
  );
}
