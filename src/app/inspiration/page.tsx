import { listInspiration } from '@/server/actions/inspiration';
import { InspirationBoard } from './inspiration-board';

export const dynamic = 'force-dynamic';
export const metadata = { title: '灵感' };

export default async function InspirationPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string; focus?: string }>;
}) {
  const [items, sp] = await Promise.all([listInspiration(), searchParams]);

  return (
    <InspirationBoard
      initialItems={items}
      autoOpenCreate={sp.new === '1'}
      focusId={sp.focus}
    />
  );
}
