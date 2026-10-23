import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { clipboardSnapshots, inspiration } from '@/db/schema';
import { fail, ok } from '@/lib/http';
import { truncate } from '@/lib/utils';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

/** 剪贴板快照 → 一键新建灵感条目 */
export async function POST(_req: Request, { params }: Ctx) {
  const { id } = await params;

  const [snap] = await db
    .select()
    .from(clipboardSnapshots)
    .where(eq(clipboardSnapshots.id, id))
    .limit(1);

  if (!snap) return fail('快照不存在', 404);

  const isCode = snap.contentType === 'code';
  const content = isCode ? `\`\`\`json\n${snap.content}\n\`\`\`` : snap.content;

  const [row] = await db
    .insert(inspiration)
    .values({
      title: truncate(snap.content, 40) || '剪贴板灵感',
      summary: truncate(snap.content, 120),
      content,
      type: isCode ? 'comfyui' : snap.contentType === 'url' ? 'note' : 'note',
      status: 'ongoing',
      tags: ['剪贴板'],
    })
    .returning();

  await db
    .update(clipboardSnapshots)
    .set({ inspirationId: row.id })
    .where(eq(clipboardSnapshots.id, id));

  return ok(row);
}
