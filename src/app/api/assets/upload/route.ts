import { NextResponse } from 'next/server';
import { saveAsset, upsertIndex } from '@/server/assets';
import { parsePngComfyMeta, parsePngSize, pickPositivePrompt } from '@/server/comfy/png-meta';
import { extractParams, isApiFormat, type ComfyWorkflow } from '@/server/comfy/prompt';

/**
 * 上传素材（粘贴 / 拖入 / 选择文件）
 * POST /api/assets/upload   multipart/form-data  file=...
 *
 * 返回：文件地址 + 解析出来的生成信息
 *   - PNG 会解析 IHDR 拿分辨率
 *   - ComfyUI 出的 PNG 还能拿到 prompt / workflow / 采样参数
 *   - 其它格式（jpg/webp/mp4）只存文件，不带元数据
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_SIZE = 200 * 1024 * 1024; // 200MB，够放短视频

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get('file');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: '缺少 file 字段' }, { status: 400 });
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: `文件过大（${(file.size / 1024 / 1024).toFixed(1)}MB），上限 200MB` },
        { status: 413 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const saved = saveAsset(buffer, file.type || file.name || '.png');

    /* --------------------------- 解析生成信息 --------------------------- */

    let width: number | undefined;
    let height: number | undefined;
    let positivePrompt: string | undefined;
    let negativePrompt: string | undefined;
    let workflow: unknown;
    let params: Record<string, unknown> = {};

    if (saved.ext === '.png') {
      const size = parsePngSize(buffer);
      if (size) {
        width = size.width;
        height = size.height;
      }

      const meta = parsePngComfyMeta(buffer);
      if (meta.prompt) {
        workflow = meta.prompt;
        if (isApiFormat(meta.prompt)) {
          const p = extractParams(meta.prompt as ComfyWorkflow);
          params = p as Record<string, unknown>;
          positivePrompt = pickPositivePrompt(meta.prompt);
          // 尺寸兜底：工作流里没写就从图片本身读
          if (!p.width && width) params.width = width;
          if (!p.height && height) params.height = height;
        }
      }
      // UI 格式的 workflow 也存一份，方便以后还原
      if (meta.workflow && !workflow) workflow = meta.workflow;
    }

    const title =
      positivePrompt?.slice(0, 30) ||
      file.name?.replace(/\.[^.]+$/, '').slice(0, 30) ||
      '粘贴的图片';

    // 写入索引，素材库列表直接读，不用再解析
    upsertIndex(saved.filename, {
      width,
      height,
      title,
      positivePrompt,
      negativePrompt,
      params,
      size: saved.size,
      createdAt: Date.now(),
    });

    return NextResponse.json({
      ok: true,
      url: saved.url,
      filename: saved.filename,
      size: saved.size,
      ext: saved.ext,
      title,
      width,
      height,
      positivePrompt,
      negativePrompt,
      params,
      hasWorkflow: Boolean(workflow),
      workflow,
    });
  } catch (err) {
    console.error('[api/assets/upload]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '上传失败' },
      { status: 500 },
    );
  }
}
