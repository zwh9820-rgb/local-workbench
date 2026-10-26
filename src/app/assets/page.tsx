import { listAssets } from '@/server/assets';
import { AssetLibrary } from './asset-library';

export const dynamic = 'force-dynamic';
export const metadata = { title: '素材库' };

export default async function AssetsPage() {
  const items = listAssets(300);

  return (
    <AssetLibrary
      initialItems={items.map((a) => ({
        filename: a.filename,
        url: a.url,
        size: a.size,
        mtime: a.mtime,
        kind: a.kind,
        width: a.width,
        height: a.height,
        title: a.title,
        positivePrompt: a.positivePrompt,
        params: a.params,
      }))}
    />
  );
}
