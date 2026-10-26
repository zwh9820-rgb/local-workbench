/**
 * 应用设置（文件持久化）
 * ----------------------------------------------------------------------------
 * 为什么不入库？—— 项目约束是「严格 8 张表」，设置项属于环境级配置，
 * 放 data/settings.json 更合适：
 *   1. 不污染业务 schema；
 *   2. Tauri v2 打包后直接读写 AppData 下的 json，无需迁移数据库；
 *   3. 导出备份时可以不包含（或单独包含）本机地址等环境信息。
 */
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { DEFAULT_COMFY_HOST, DEFAULT_LM_STUDIO_HOST } from '@/lib/constants';

export const settingsSchema = z.object({
  /** ComfyUI 多实例，第一个为默认 */
  comfyInstances: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        host: z.string(),
      }),
    )
    .default([{ id: 'default', name: '本机 ComfyUI', host: DEFAULT_COMFY_HOST }]),
  lmStudio: z
    .object({
      baseUrl: z.string().default(DEFAULT_LM_STUDIO_HOST),
      model: z.string().default('deepseek-r1-distill-qwen-7b'),
      temperature: z.number().min(0).max(2).default(0.7),
      maxSteps: z.number().int().min(1).max(20).default(8),
    })
    .default({
      baseUrl: DEFAULT_LM_STUDIO_HOST,
      model: 'deepseek-r1-distill-qwen-7b',
      temperature: 0.7,
      maxSteps: 8,
    }),
  /** 画布默认行为 */
  canvas: z
    .object({
      snapToGrid: z.boolean().default(false),
      showMinimap: z.boolean().default(false),
    })
    .default({ snapToGrid: false, showMinimap: false }),
});

export type AppSettings = z.infer<typeof settingsSchema>;

function settingsPath(): string {
  const dataDir = process.env.APP_DATA_DIR
    ? path.resolve(process.cwd(), process.env.APP_DATA_DIR)
    : path.join(process.cwd(), 'data');
  return path.join(dataDir, 'settings.json');
}

export const SETTINGS_PATH = settingsPath();

export function readSettings(): AppSettings {
  try {
    const raw = fs.readFileSync(SETTINGS_PATH, 'utf8');
    return settingsSchema.parse(JSON.parse(raw));
  } catch {
    // 文件不存在或格式损坏 → 返回默认值（不抛错，保证应用可启动）
    return settingsSchema.parse({});
  }
}

export function writeSettings(input: unknown): AppSettings {
  const next = settingsSchema.parse(input);
  fs.mkdirSync(path.dirname(SETTINGS_PATH), { recursive: true });
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(next, null, 2), 'utf8');
  return next;
}

/** 取默认 ComfyUI 地址（ComfyUI 调度模块统一从这里读） */
export function defaultComfyHost(): string {
  const s = readSettings();
  return s.comfyInstances[0]?.host ?? DEFAULT_COMFY_HOST;
}
