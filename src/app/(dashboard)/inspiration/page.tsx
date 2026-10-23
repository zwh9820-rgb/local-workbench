import { Suspense } from 'react';
import { InspirationClient } from '@/components/inspiration/InspirationClient';

export const metadata = { title: '灵感素材库 · 本地工作台' };

export default function InspirationPage() {
  return (
    <Suspense
      fallback={<div className="p-6 text-xs text-ink-500">灵感素材库加载中…</div>}
    >
      <InspirationClient />
    </Suspense>
  );
}
