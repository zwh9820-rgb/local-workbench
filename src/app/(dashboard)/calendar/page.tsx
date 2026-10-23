import { Suspense } from 'react';
import { CalendarClient } from '@/components/calendar/CalendarClient';

export const metadata = { title: '日历 · 本地工作台' };

export default function CalendarPage() {
  return (
    <Suspense fallback={<div className="p-6 text-xs text-ink-500">日历加载中…</div>}>
      <CalendarClient />
    </Suspense>
  );
}
