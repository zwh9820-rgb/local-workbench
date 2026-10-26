import { listTodos } from '@/server/actions/todo';
import { TodoBoard } from './todo-board';

export const dynamic = 'force-dynamic';
export const metadata = { title: '待办' };

export default async function TodoPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string }>;
}) {
  const [items, sp] = await Promise.all([listTodos(), searchParams]);

  return <TodoBoard initialItems={items} autoOpenCreate={sp.new === '1'} />;
}
