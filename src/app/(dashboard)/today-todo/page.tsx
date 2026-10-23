import { Suspense } from 'react';
import { TodoClient } from '@/components/todo/TodoClient';

export const metadata = { title: '今日待办 · 本地工作台' };

export default function TodayTodoPage() {
  return (
    <Suspense fallback={<div className="p-6 text-xs text-ink-500">加载中…</div>}>
      <TodoClient scope="today" />
    </Suspense>
  );
}
