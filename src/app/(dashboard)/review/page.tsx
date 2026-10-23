import { Suspense } from 'react';
import { ReviewClient } from '@/components/review/ReviewClient';

export const metadata = { title: '今日复盘 · 本地工作台' };

export default function ReviewPage() {
  return (
    <Suspense fallback={<div className="p-6 text-xs text-ink-500">加载中…</div>}>
      <ReviewClient />
    </Suspense>
  );
}
