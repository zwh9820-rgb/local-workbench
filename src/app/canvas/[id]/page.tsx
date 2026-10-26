import { notFound } from 'next/navigation';
import { getCanvasWithNodes } from '@/server/actions/canvas';
import { defaultComfyHost } from '@/server/settings';
import { CanvasEditor } from './canvas-editor';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getCanvasWithNodes(id);
  return { title: data?.canvas.name ?? '画布' };
}

export default async function CanvasDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ focus?: string }>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const data = await getCanvasWithNodes(id);

  if (!data) notFound();

  return (
    <CanvasEditor
      canvas={data.canvas}
      nodes={data.nodes}
      focusId={sp.focus}
      comfyHost={defaultComfyHost()}
    />
  );
}
