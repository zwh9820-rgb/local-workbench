'use client';

import { useEffect, useRef } from 'react';
import { api } from '@/lib/api';

const STORAGE_KEY = 'wb:clipboard-capture';

/**
 * 后台剪贴板捕获。
 *
 * 注意：纯 Web 无法轮询系统剪贴板（浏览器安全限制），
 * 因此这里监听页面内的 copy / paste 事件，把复制内容落库。
 * 迁移到 Tauri 后可换成 clipboard-manager 插件实现全系统捕获，
 * 只需替换本组件，API 与表结构不用动。
 */
export function ClipboardCapture() {
  const last = useRef<{ text: string; at: number }>({ text: '', at: 0 });

  useEffect(() => {
    const push = async (text: string) => {
      const content = text.trim();
      if (content.length < 2) return;
      const now = Date.now();
      // 5 秒内相同内容不重复入库
      if (last.current.text === content && now - last.current.at < 5000) return;
      last.current = { text: content, at: now };
      try {
        await api.post('/api/clipboard', { content, sourceApp: '页面复制' });
      } catch {
        // 静默失败，不打扰用户
      }
    };

    const enabled = () => localStorage.getItem(STORAGE_KEY) !== 'off';

    const onCopy = () => {
      if (!enabled()) return;
      const text = window.getSelection()?.toString() ?? '';
      if (text) void push(text);
    };

    const onPaste = (e: ClipboardEvent) => {
      if (!enabled()) return;
      const text = e.clipboardData?.getData('text/plain') ?? '';
      if (text) void push(text);
    };

    document.addEventListener('copy', onCopy);
    document.addEventListener('paste', onPaste);
    return () => {
      document.removeEventListener('copy', onCopy);
      document.removeEventListener('paste', onPaste);
    };
  }, []);

  return null;
}

/** 开关：在剪贴板抽屉里切换 */
export function setClipboardCaptureEnabled(v: boolean) {
  localStorage.setItem(STORAGE_KEY, v ? 'on' : 'off');
}

export function isClipboardCaptureEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  return localStorage.getItem(STORAGE_KEY) !== 'off';
}
