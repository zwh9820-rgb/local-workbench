import { Suspense } from 'react';
import { PromptTemplateClient } from '@/components/prompt/PromptTemplateClient';

export const metadata = { title: '提示词模板 · 本地工作台' };

export default function PromptTemplatePage() {
  return (
    <Suspense fallback={<div className="p-6 text-xs text-ink-500">加载中…</div>}>
      <PromptTemplateClient />
    </Suspense>
  );
}
