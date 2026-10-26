/**
 * PNG 内嵌元数据解析（ComfyUI 出图的关键能力）
 * ----------------------------------------------------------------------------
 * ComfyUI 生成的 PNG 会在 tEXt chunk 里写入两条 JSON：
 *   - prompt   : API 格式工作流（提交时用的那份，含完整参数）
 *   - workflow : UI 格式工作流（前端画布那份，含节点坐标）
 * 解析出来就能把「生成这张图的完整上下文」回填到 image 节点。
 *
 * 纯手写 PNG chunk 解析，不引第三方依赖。
 */
import zlib from 'node:zlib';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export interface PngComfyMeta {
  /** API 格式工作流 */
  prompt?: unknown;
  /** UI 格式工作流 */
  workflow?: unknown;
  /** 其它文本块（原始键值） */
  texts: Record<string, string>;
}

/** 从 tEXt / iTXt / zTXt 里读出文本块 */
function readTextChunks(buf: Buffer): Record<string, string> {
  const out: Record<string, string> = {};

  if (buf.length < 8 || !buf.subarray(0, 8).equals(PNG_SIGNATURE)) return out;

  let offset = 8;

  while (offset + 8 <= buf.length) {
    const length = buf.readUInt32BE(offset);
    const type = buf.toString('ascii', offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;

    if (dataEnd + 4 > buf.length) break;

    if (type === 'IEND') break;

    if (type === 'tEXt') {
      const data = buf.subarray(dataStart, dataEnd);
      const sep = data.indexOf(0);
      if (sep > 0) {
        const key = data.toString('latin1', 0, sep);
        out[key] = data.toString('latin1', sep + 1);
      }
    } else if (type === 'zTXt') {
      const data = buf.subarray(dataStart, dataEnd);
      const sep = data.indexOf(0);
      if (sep > 0 && sep + 2 <= data.length) {
        const key = data.toString('latin1', 0, sep);
        try {
          const inflated = zlib.inflateSync(data.subarray(sep + 2));
          out[key] = inflated.toString('latin1');
        } catch {
          /* 忽略损坏的块 */
        }
      }
    } else if (type === 'iTXt') {
      const data = buf.subarray(dataStart, dataEnd);
      const keyEnd = data.indexOf(0);
      if (keyEnd > 0) {
        const key = data.toString('latin1', 0, keyEnd);
        const compressionFlag = data[keyEnd + 1];
        // 跳过 compressionFlag(1) + compressionMethod(1)
        let p = keyEnd + 3;
        // languageTag
        const langEnd = data.indexOf(0, p);
        if (langEnd < 0) {
          offset = dataEnd + 4;
          continue;
        }
        p = langEnd + 1;
        // translatedKeyword
        const transEnd = data.indexOf(0, p);
        if (transEnd < 0) {
          offset = dataEnd + 4;
          continue;
        }
        p = transEnd + 1;
        const payload = data.subarray(p);
        try {
          out[key] =
            compressionFlag === 1
              ? zlib.inflateSync(payload).toString('utf8')
              : payload.toString('utf8');
        } catch {
          /* 忽略 */
        }
      }
    }

    offset = dataEnd + 4; // 跳过 CRC
  }

  return out;
}

/** 安全解析 JSON */
function tryParse(raw?: string): unknown {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

/** 解析 PNG 里的 ComfyUI 元数据 */
export function parsePngComfyMeta(buf: Buffer): PngComfyMeta {
  const texts = readTextChunks(buf);
  return {
    prompt: tryParse(texts.prompt),
    workflow: tryParse(texts.workflow),
    texts,
  };
}

/** 从 API 格式工作流里取正向提示词（兜底用） */
export function pickPositivePrompt(promptJson: unknown): string | undefined {
  if (!promptJson || typeof promptJson !== 'object') return undefined;
  const wf = promptJson as Record<string, { class_type?: string; inputs?: Record<string, unknown> }>;

  // 优先找采样器的 positive 链接
  for (const node of Object.values(wf)) {
    if (!/sampler/i.test(node?.class_type ?? '')) continue;
    const pos = node.inputs?.positive;
    if (Array.isArray(pos) && pos.length > 0) {
      const target = wf[String(pos[0])];
      const text = target?.inputs?.text;
      if (typeof text === 'string') return text;
    }
  }

  // 兜底：第一个 CLIPTextEncode
  for (const node of Object.values(wf)) {
    if ((node?.class_type ?? '').includes('CLIPTextEncode')) {
      const text = node.inputs?.text;
      if (typeof text === 'string') return text;
    }
  }

  return undefined;
}
