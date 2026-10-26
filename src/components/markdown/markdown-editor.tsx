'use client';

import dynamic from 'next/dynamic';
import '@uiw/react-md-editor/markdown-editor.css';
import '@uiw/react-markdown-preview/markdown.css';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/card';

/**
 * Markdown 编辑器
 * ----------------------------------------------------------------------------
 * - 客户端专用（编辑器依赖 DOM），用 dynamic + ssr:false 隔离，避免 SSR 报错
 * - 配色跟随 <html data-color-mode>，由 globals.css 里的灰度覆盖统一接管
 * - 默认 live 分栏，可切纯编辑；支持 json / bash 代码块高亮
 */
const MDEditor = dynamic(() => import('@uiw/react-md-editor'), {
  ssr: false,
  loading: () => <Skeleton className="h-[260px] w-full" />,
});

export interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  height?: number;
  placeholder?: string;
  preview?: 'edit' | 'live' | 'preview';
  className?: string;
  /** 隐藏工具栏（节点内嵌编辑时用） */
  hideToolbar?: boolean;
}

export function MarkdownEditor({
  value,
  onChange,
  height = 260,
  placeholder = '写点什么…',
  preview = 'live',
  className,
  hideToolbar = false,
}: MarkdownEditorProps) {
  return (
    <div className={cn('w-md-editor-wrapper overflow-hidden rounded-md', className)}>
      <MDEditor
        value={value}
        onChange={(v) => onChange(v ?? '')}
        height={height}
        preview={preview}
        hideToolbar={hideToolbar}
        visibleDragbar={false}
        textareaProps={{ placeholder }}
        style={{ fontSize: 13 }}
      />
    </div>
  );
}

/** Markdown 只读预览 */
const MarkdownPreview = dynamic(
  () => import('@uiw/react-markdown-preview').then((m) => m.default),
  {
    ssr: false,
    loading: () => <Skeleton className="h-20 w-full" />,
  },
);

export function MarkdownView({
  source,
  className,
}: {
  source: string;
  className?: string;
}) {
  if (!source?.trim()) {
    return <p className={cn('text-xs text-ink-muted', className)}>（空）</p>;
  }
  return (
    <div className={cn('text-[13px]', className)}>
      <MarkdownPreview source={source} style={{ background: 'transparent', fontSize: 13 }} />
    </div>
  );
}
