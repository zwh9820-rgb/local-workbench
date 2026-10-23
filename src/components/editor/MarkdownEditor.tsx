'use client';

import dynamic from 'next/dynamic';
import '@uiw/react-md-editor/markdown-editor.css';
import '@uiw/react-markdown-preview/markdown.css';

/**
 * Markdown 编辑器封装。
 * - 关闭 SSR（编辑器依赖 window）
 * - 支持 GFM + 代码高亮（json / bash / ts 等），适合 ComfyUI 工作流、提示词、调试日志
 */
const MDEditor = dynamic(() => import('@uiw/react-md-editor'), {
  ssr: false,
  loading: () => (
    <div className="flex h-[320px] items-center justify-center rounded-lg border border-[var(--border-soft)] bg-paper text-xs text-ink-500">
      编辑器加载中…
    </div>
  ),
});

export function MarkdownEditor({
  value,
  onChange,
  height = 360,
  placeholder = '支持 Markdown，代码块请标注语言（json / bash / python）',
}: {
  value: string;
  onChange: (v: string) => void;
  height?: number;
  placeholder?: string;
}) {
  return (
    <div data-color-mode="light" className="overflow-hidden rounded-lg">
      <MDEditor
        value={value}
        onChange={(v) => onChange(v ?? '')}
        height={height}
        preview="live"
        visibleDragbar={false}
        textareaProps={{ placeholder }}
        style={{ background: '#fff' }}
      />
    </div>
  );
}

export default MarkdownEditor;
