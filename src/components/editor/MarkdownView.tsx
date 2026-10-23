'use client';

import dynamic from 'next/dynamic';
import '@uiw/react-markdown-preview/markdown.css';
import { cn } from '@/lib/utils';

const MarkdownPreview = dynamic(() => import('@uiw/react-markdown-preview'), {
  ssr: false,
  loading: () => <div className="text-xs text-ink-500">渲染中…</div>,
});

/** 只读 Markdown 渲染（代码高亮 + GFM 表格） */
export function MarkdownView({
  source,
  className,
}: {
  source: string;
  className?: string;
}) {
  return (
    <div data-color-mode="light" className={cn('wmde-markdown md-body', className)}>
      <MarkdownPreview
        source={source}
        style={{ background: 'transparent', fontSize: 13.5 }}
      />
    </div>
  );
}

export default MarkdownView;
