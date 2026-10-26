import { listCanvases } from '@/server/actions/canvas';
import { CanvasGrid } from './canvas-grid';

export const dynamic = 'force-dynamic';
export const metadata = { title: '画布' };

export default async function CanvasListPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string }>;
}) {
  const [items, sp] = await Promise.all([listCanvases(), searchParams]);

  return <CanvasGrid initialItems={items} autoOpenCreate={sp.new === '1'} />;
}
