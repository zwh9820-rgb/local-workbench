import { Suspense } from 'react';
import { AgentClient } from '@/components/agent/AgentClient';

export const metadata = { title: 'AI 助手 · 本地工作台' };

export default function AgentPage() {
  return (
    <Suspense fallback={<div className="p-6 text-xs text-ink-500">Agent 加载中…</div>}>
      <AgentClient />
    </Suspense>
  );
}
