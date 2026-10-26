/**
 * ComfyUI 工作流处理：提示词覆盖 + 变量替换
 * ----------------------------------------------------------------------------
 * 只处理 API 格式工作流（`{ "3": { class_type, inputs } }`），
 * 这是 POST /prompt 唯一接受的格式。UI 格式（nodes/links 数组）会被识别并拒绝。
 */

export interface ComfyNode {
  class_type?: string;
  inputs?: Record<string, unknown>;
  _meta?: { title?: string };
}

export type ComfyWorkflow = Record<string, ComfyNode>;

/** 是否为 API 格式工作流 */
export function isApiFormat(wf: unknown): wf is ComfyWorkflow {
  if (!wf || typeof wf !== 'object') return false;
  if (Array.isArray(wf)) return false;
  const entries = Object.entries(wf as Record<string, unknown>);
  if (entries.length === 0) return false;
  // API 格式：每个 value 都有 class_type
  return entries.every(
    ([, v]) =>
      v !== null &&
      typeof v === 'object' &&
      typeof (v as ComfyNode).class_type === 'string',
  );
}

/** 替换文本中的 {{变量}} 占位符 */
export function replaceVariables(text: string, values?: Record<string, string>): string {
  if (!values) return text;
  return text.replace(/\{\{\s*([\w-]+)\s*\}\}/g, (whole, name: string) => {
    const v = values[name];
    return v === undefined || v === null ? whole : v;
  });
}

/** 抽取文本里的变量名 */
export function extractVariables(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/\{\{\s*([\w-]+)\s*\}\}/g)) out.add(m[1]);
  return Array.from(out);
}

/* --------------------------- 定位正/负向提示词 --------------------------- */

interface TextTargets {
  positiveId?: string;
  negativeId?: string;
}

/**
 * 定位提示词节点：
 *   1. 优先从采样器节点的 inputs.positive / inputs.negative 链接反查
 *   2. 兜底：所有 CLIPTextEncode 按 id 排序，第一个作正向、第二个作负向
 */
function findTextTargets(wf: ComfyWorkflow): TextTargets {
  const targets: TextTargets = {};

  for (const node of Object.values(wf)) {
    const ct = node.class_type ?? '';
    if (!/sampler/i.test(ct)) continue;
    const pos = node.inputs?.positive;
    const neg = node.inputs?.negative;
    if (Array.isArray(pos) && pos.length > 0) targets.positiveId = String(pos[0]);
    if (Array.isArray(neg) && neg.length > 0) targets.negativeId = String(neg[0]);
    if (targets.positiveId || targets.negativeId) break;
  }

  if (!targets.positiveId) {
    const encoders = Object.entries(wf)
      .filter(([, n]) => (n.class_type ?? '').includes('CLIPTextEncode'))
      .map(([id]) => id)
      .sort((a, b) => Number(a) - Number(b));

    if (encoders[0]) targets.positiveId = encoders[0];
    if (!targets.negativeId && encoders[1]) targets.negativeId = encoders[1];
  }

  return targets;
}

/** 读取节点当前文本 */
function readText(node?: ComfyNode): string {
  const t = node?.inputs?.text;
  return typeof t === 'string' ? t : '';
}

export interface OverrideResult {
  workflow: ComfyWorkflow;
  /** 实际改动了几个节点 */
  changed: number;
  positiveId?: string;
  negativeId?: string;
  /** 覆盖后生效的正向提示词（用于回填节点 meta） */
  effectivePositive: string;
  effectiveNegative: string;
  /** 未解析的变量名（提示用户补值） */
  unresolved: string[];
}

/**
 * 应用提示词覆盖
 * @param positive 正向提示词（空则保留工作流原值）
 * @param negative 负向提示词（空则保留原值）
 * @param values   {{变量}} 填充值
 */
export function applyPromptOverride(
  source: ComfyWorkflow,
  opts: {
    positive?: string;
    negative?: string;
    values?: Record<string, string>;
  } = {},
): OverrideResult {
  // 深拷贝，避免污染节点里存的原始工作流
  const wf: ComfyWorkflow = JSON.parse(JSON.stringify(source));
  const targets = findTextTargets(wf);
  let changed = 0;

  const posText = opts.positive ? replaceVariables(opts.positive, opts.values) : '';
  const negText = opts.negative ? replaceVariables(opts.negative, opts.values) : '';

  if (posText && targets.positiveId && wf[targets.positiveId]) {
    wf[targets.positiveId].inputs = {
      ...(wf[targets.positiveId].inputs ?? {}),
      text: posText,
    };
    changed += 1;
  }

  if (negText && targets.negativeId && wf[targets.negativeId]) {
    wf[targets.negativeId].inputs = {
      ...(wf[targets.negativeId].inputs ?? {}),
      text: negText,
    };
    changed += 1;
  }

  // 全局变量替换：所有字符串输入里的 {{var}}
  if (opts.values && Object.keys(opts.values).length > 0) {
    for (const node of Object.values(wf)) {
      if (!node.inputs) continue;
      for (const [key, val] of Object.entries(node.inputs)) {
        if (typeof val !== 'string' || !val.includes('{{')) continue;
        const next = replaceVariables(val, opts.values);
        if (next !== val) {
          node.inputs[key] = next;
          changed += 1;
        }
      }
    }
  }

  const effectivePositive = targets.positiveId
    ? readText(wf[targets.positiveId])
    : '';
  const effectiveNegative = targets.negativeId ? readText(wf[targets.negativeId]) : '';

  const unresolved = [
    ...extractVariables(effectivePositive),
    ...extractVariables(effectiveNegative),
  ];

  return {
    workflow: wf,
    changed,
    positiveId: targets.positiveId,
    negativeId: targets.negativeId,
    effectivePositive,
    effectiveNegative,
    unresolved: Array.from(new Set(unresolved)),
  };
}

/* ------------------------------ 参数提取 ------------------------------- */

export interface WorkflowParams {
  steps?: number;
  cfg?: number;
  seed?: number;
  sampler?: string;
  scheduler?: string;
  model?: string;
  width?: number;
  height?: number;
}

/** 从工作流里抽取关键生成参数（回填 image 节点 meta 用） */
export function extractParams(wf: ComfyWorkflow): WorkflowParams {
  const params: WorkflowParams = {};

  for (const node of Object.values(wf)) {
    const ct = node.class_type ?? '';
    const inputs = node.inputs ?? {};

    if (/sampler/i.test(ct)) {
      if (typeof inputs.steps === 'number') params.steps = inputs.steps;
      if (typeof inputs.cfg === 'number') params.cfg = inputs.cfg;
      if (typeof inputs.seed === 'number') params.seed = inputs.seed;
      if (typeof inputs.sampler_name === 'string') params.sampler = inputs.sampler_name;
      if (typeof inputs.scheduler === 'string') params.scheduler = inputs.scheduler;
    }

    if (ct === 'EmptyLatentImage' || ct === 'EmptySD3LatentImage') {
      if (typeof inputs.width === 'number') params.width = inputs.width;
      if (typeof inputs.height === 'number') params.height = inputs.height;
    }

    if (ct === 'CheckpointLoaderSimple' && typeof inputs.ckpt_name === 'string') {
      params.model = inputs.ckpt_name;
    }
  }

  return params;
}
