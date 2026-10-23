'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUiStore } from '@/store/ui';

/**
 * 全局快捷键
 * Ctrl+K 搜索 / Ctrl+N 新建灵感 / Ctrl+T 新建待办 / Ctrl+R 打开复盘 / Esc 关闭
 *
 * Esc 由各弹窗自行处理，这里只兜底关闭搜索与剪贴板抽屉。
 */
export function HotkeysProvider() {
  const router = useRouter();
  const toggleSearch = useUiStore((s) => s.toggleSearch);
  const setSearchOpen = useUiStore((s) => s.setSearchOpen);
  const setClipboardOpen = useUiStore((s) => s.setClipboardOpen);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;

      if (e.key === 'Escape') {
        setSearchOpen(false);
        setClipboardOpen(false);
        return;
      }

      if (!mod) return;

      switch (e.key.toLowerCase()) {
        case 'k':
          e.preventDefault();
          toggleSearch();
          break;
        case 'n':
          // 浏览器默认 Ctrl+N 开新窗口，必须拦截
          e.preventDefault();
          router.push('/inspiration?new=1');
          break;
        case 't':
          e.preventDefault();
          router.push('/today-todo?new=1');
          break;
        case 'r':
          // 浏览器默认 Ctrl+R 刷新，必须拦截
          e.preventDefault();
          router.push('/review');
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [router, toggleSearch, setSearchOpen, setClipboardOpen]);

  return null;
}
