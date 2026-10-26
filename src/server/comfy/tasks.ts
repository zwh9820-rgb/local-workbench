/**
 * ComfyUI 任务编排（服务端）
 * ----------------------------------------------------------------------------
 * 职责：
 *   1. runComfyNode   —— 校验工作流 → 覆盖提示词 → POST /prompt → 节点置为 queued
 *   2. collectResult  —— 拉 /history → 取图 → 解析 PNG 元数据 → 生成 image 节点
 *
 * 设计约束（来自需求）：
 *   - Agent 禁止自动提交生成任务，只有人工点「运行」才会走 runComfyNode
 *   - 不做全局队列面板，状态只存在节点 meta 里
 */
import { eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { canvas, canvasNode, type CanvasNodeMeta } from '@/db/schema';
import { defaultComfyHost } from '@/server/settings';
import {
  collectImages,
  downloadImage,
  getHistory,
  normalizeHost,
  submitPrompt,
  type ComfyImageRef,
} from './client';
import { parsePngComfyMeta, pickPositivePrompt } from './png-meta';
import {
  applyPromptOverride,
  extractParams,
  isApiFormat,
  type ComfyWorkflow,
} from './prompt';
import { uuid } from '@/lib/utils';

export interface RunResult {
  promptId: string;
  host: string;
  /** 覆盖后实际生效的正向提示词 */
  positive: string;
  changedNodes: number;
}

/* ------------------------------ 提交任务 ------------------------------- */

export async function runComfyNode(
  nodeId: string,
  opts: { values?: Record<string, string>; clientId?: string } = {},
): Promise<RunResult> {
  const node = db.select().from(canvasNode).where(eq(canvasNode.id, nodeId)).get();
  if (!node) throw new Error('节点不存在');
  if (node.nodeType !== 'comfy_run') throw new Error('该节点不是 ComfyUI 任务节点');

  const meta = (node.meta ?? {}) as CanvasNodeMeta;
  const workflow = meta.workflowJson;

  if (!workflow) {
    throw new Error('该节点还没有工作流，请先「抓取当前工作流」或粘贴 JSON');
  }
  if (!isApiFormat(workflow)) {
    throw new Error(
      '工作流不是 API 格式。请在 ComfyUI 里用「Save (API Format)」导出后粘贴。',
    );
  }

  const host = normalizeHost(meta.comfyHost || defaultComfyHost());

  // 覆盖提示词（支持 {{变量}}）
  const applied = applyPromptOverride(workflow as ComfyWorkflow, {
    positive: meta.promptOverride,
    negative: meta.negativeOverride,
    values: opts.values,
  });

  if (applied.unresolved.length > 0) {
    throw new Error(
      `提示词里还有未填充的变量：${applied.unresolved.map((v) => `{{${v}}}`).join(', ')}`,
    );
  }

  // 先落 queued，避免用户重复点击
  db.update(canvasNode)
    .set({
      meta: {
        ...meta,
        status: 'queued',
        progress: 0,
        error: undefined,
        comfyHost: host,
        submittedAt: Date.now(),
      },
      updatedAt: new Date(),
    })
    .where(eq(canvasNode.id, nodeId))
    .run();

  try {
    const res = await submitPrompt(host, applied.workflow, opts.clientId);

    db.update(canvasNode)
      .set({
        meta: {
          ...meta,
          status: 'queued',
          progress: 0,
          comfyHost: host,
          historyId: res.prompt_id,
          submittedAt: Date.now(),
          // 记录实际提交的正负向，方便回看
          effectivePositive: applied.effectivePositive,
          effectiveNegative: applied.effectiveNegative,
        } as CanvasNodeMeta,
        updatedAt: new Date(),
      })
      .where(eq(canvasNode.id, nodeId))
      .run();

    return {
      promptId: res.prompt_id,
      host,
      positive: applied.effectivePositive,
      changedNodes: applied.changed,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : '提交失败';
    db.update(canvasNode)
      .set({
        meta: { ...meta, status: 'error', progress: 0, error: message, comfyHost: host },
        updatedAt: new Date(),
      })
      .where(eq(canvasNode.id, nodeId))
      .run();
    throw err;
  }
}

/* ------------------------------ 收集结果 ------------------------------- */

export interface CollectResult {
  status: 'done' | 'pending' | 'error';
  images: number;
  imageNodeIds: string[];
  message?: string;
}

/** /view 代理地址（带 host，支持多实例） */
function buildProxyPath(host: string, img: ComfyImageRef): string {
  const params = new URLSearchParams({
    host,
    filename: img.filename,
    subfolder: img.subfolder ?? '',
    type: img.type ?? 'output',
  });
  return `/api/comfy/view?${params.toString()}`;
}

/**
 * 拉取任务结果并回填
 * 幂等：重复调用不会重复创建 image 节点（靠 meta.lastResultImageId 判断）
 */
export async function collectResult(nodeId: string): Promise<CollectResult> {
  const node = db.select().from(canvasNode).where(eq(canvasNode.id, nodeId)).get();
  if (!node) throw new Error('节点不存在');

  const meta = (node.meta ?? {}) as CanvasNodeMeta;
  const promptId = meta.historyId;
  if (!promptId) throw new Error('该节点没有可收集的任务');

  if (meta.status === 'done' && meta.lastResultImageId) {
    return { status: 'done', images: 0, imageNodeIds: [meta.lastResultImageId] };
  }

  const host = normalizeHost(meta.comfyHost || defaultComfyHost());
  const entry = await getHistory(host, promptId);
  const images = collectImages(entry);

  if (!entry) {
    return { status: 'pending', images: 0, imageNodeIds: [], message: '任务尚未完成' };
  }
  if (images.length === 0) {
    const failed = entry.status?.status_str === 'error';
    db.update(canvasNode)
      .set({
        meta: {
          ...meta,
          status: failed ? 'error' : 'done',
          progress: failed ? (meta.progress ?? 0) : 100,
          error: failed ? 'ComfyUI 执行失败' : undefined,
          finishedAt: Date.now(),
        },
        updatedAt: new Date(),
      })
      .where(eq(canvasNode.id, nodeId))
      .run();
    return {
      status: failed ? 'error' : 'done',
      images: 0,
      imageNodeIds: [],
      message: failed ? '任务执行失败' : '任务完成但没有图片输出',
    };
  }

  /* -------- 解析第一张图的 PNG 元数据（拿到完整生成上下文） -------- */
  let parsedPrompt: unknown;
  let params: ReturnType<typeof extractParams> = {};
  let positive = String(meta.effectivePositive ?? '');
  let negative = String(meta.effectiveNegative ?? '');

  try {
    const { buffer } = await downloadImage(host, images[0]);
    const png = parsePngComfyMeta(buffer);
    parsedPrompt = png.prompt;
    if (isApiFormat(png.prompt)) {
      params = extractParams(png.prompt as ComfyWorkflow);
      positive = pickPositivePrompt(png.prompt) ?? positive;
    }
  } catch {
    /* 取图失败不阻断回填，只是少元数据 */
  }

  /* ------------------------- 在右侧生成 image 节点 ------------------------ */
  const imageNodeIds: string[] = [];
  const baseX = node.positionX + node.width + 60;
  const gap = 24;
  const imgW = 360;
  const imgH = 400;

  const created = db.transaction((tx) => {
    const ids: string[] = [];

    images.slice(0, 4).forEach((img, i) => {
      const id = uuid();
      const imagePath = buildProxyPath(host, img);

      tx.insert(canvasNode)
        .values({
          id,
          canvasId: node.canvasId,
          nodeType: 'image',
          title: img.filename.replace(/\.[a-z0-9]+$/i, '').slice(0, 40),
          content: '',
          imagePath,
          positionX: baseX,
          positionY: node.positionY + i * (imgH + gap),
          width: imgW,
          height: imgH,
          zIndex: node.zIndex + 1,
          meta: {
            filename: img.filename,
            subfolder: img.subfolder,
            type: img.type,
            positivePrompt: positive,
            negativePrompt: negative,
            workflow: parsedPrompt ?? meta.workflowJson,
            params,
            sourceNodeId: nodeId,
            sourceHistoryId: promptId,
            comfyHost: host,
          } as CanvasNodeMeta,
        })
        .run();

      ids.push(id);
    });

    // 更新来源节点
    tx.update(canvasNode)
      .set({
        meta: {
          ...meta,
          status: 'done',
          progress: 100,
          lastResultImageId: ids[0],
          error: undefined,
          finishedAt: Date.now(),
          effectivePositive: positive,
          effectiveNegative: negative,
        },
        updatedAt: new Date(),
      })
      .where(eq(canvasNode.id, nodeId))
      .run();

    // 画布没封面时，用第一张图当封面
    const c = tx.select().from(canvas).where(eq(canvas.id, node.canvasId)).get();
    if (c && !c.coverImage) {
      tx.update(canvas)
        .set({ coverImage: buildProxyPath(host, images[0]), updatedAt: new Date() })
        .where(eq(canvas.id, node.canvasId))
        .run();
    }

    tx.update(canvas)
      .set({ updatedAt: new Date() })
      .where(eq(canvas.id, node.canvasId))
      .run();

    return ids;
  });

  imageNodeIds.push(...created);

  return { status: 'done', images: images.length, imageNodeIds };
}

/* --------------------------- 运行中的进度更新 --------------------------- */

/** WS 收到进度时落库（节流由调用方控制） */
export function updateNodeProgress(nodeId: string, progress: number): void {
  const node = db.select().from(canvasNode).where(eq(canvasNode.id, nodeId)).get();
  if (!node) return;
  const meta = (node.meta ?? {}) as CanvasNodeMeta;

  db.update(canvasNode)
    .set({
      meta: {
        ...meta,
        status: 'running',
        progress: Math.max(0, Math.min(100, Math.round(progress))),
      },
      updatedAt: new Date(),
    })
    .where(eq(canvasNode.id, nodeId))
    .run();
}

/** 按 prompt_id 找节点（WS 消息里只有 prompt_id） */
export function findNodeByPromptId(promptId: string) {
  return db
    .select({ id: canvasNode.id, canvasId: canvasNode.canvasId })
    .from(canvasNode)
    .where(sql`json_extract(${canvasNode.meta}, '$.historyId') = ${promptId}`)
    .get();
}
