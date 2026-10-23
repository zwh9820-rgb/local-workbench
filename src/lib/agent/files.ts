import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, isAbsolute, join, normalize, relative, sep } from 'node:path';
import { getMaterialDir } from '@/lib/paths';

/**
 * Agent 文件白名单读取。
 *
 * 安全边界（非常重要）：
 * 1. 只允许读取「素材目录」内的文件：Web 为 public/assets/ai-material，
 *    Tauri 为 %APPDATA%/com.local.workbench/ai-material（见 @/lib/paths）
 * 2. 只允许 .md / .markdown / .json / .txt 文本类型
 * 3. 禁止绝对路径、禁止 .. 穿越
 * 4. 单文件最大 512KB
 * 5. 绝不提供写入 / 删除 / 执行能力
 *
 * 注意：本文件的校验逻辑与 Web 版完全一致，只是根目录来源换成 getMaterialDir()。
 * Agent 的 readWhiteListFile 工具、系统提示里的文件清单都走这里，无需改动。
 */

export const ALLOWED_EXT = new Set(['.md', '.markdown', '.json', '.txt']);
export const MAX_FILE_BYTES = 512 * 1024;

export function getMaterialRoot(): string {
  return getMaterialDir();
}

export type MaterialFile = { path: string; size: number; modifiedAt: number };

/** 递归列出白名单目录内的可读文本文件（供 Agent 了解可用素材） */
export function listMaterialFiles(dir = getMaterialRoot(), acc: MaterialFile[] = []): MaterialFile[] {
  if (!existsSync(dir)) return acc;
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      listMaterialFiles(full, acc);
    } else if (ALLOWED_EXT.has(extname(name).toLowerCase()) && st.size <= MAX_FILE_BYTES) {
      acc.push({
        path: relative(getMaterialRoot(), full).split(sep).join('/'),
        size: st.size,
        modifiedAt: st.mtimeMs,
      });
    }
  }
  return acc;
}

/** 严格校验并读取单个文件 */
export function readWhitelistFile(inputPath: string): {
  path: string;
  size: number;
  content: string;
} {
  const raw = (inputPath ?? '').trim();
  if (!raw) throw new Error('文件路径不能为空');

  // 统一分隔符，拒绝绝对路径与穿越
  const normalizedInput = raw.replace(/\\/g, '/');
  if (isAbsolute(raw) || /^[a-zA-Z]:/.test(raw)) {
    throw new Error('禁止使用绝对路径，请填写相对于素材目录的路径');
  }
  const segments = normalizedInput.split('/');
  if (segments.some((s) => s === '..')) {
    throw new Error('路径中不允许出现 ..');
  }

  const root = getMaterialRoot();
  const target = normalize(join(root, normalizedInput));

  // 双保险：resolve 后必须仍在根目录内
  if (target !== root && !target.startsWith(root + sep)) {
    throw new Error('路径越界：只允许访问素材白名单目录');
  }

  const ext = extname(target).toLowerCase();
  if (!ALLOWED_EXT.has(ext)) {
    throw new Error(`只允许读取 ${[...ALLOWED_EXT].join(' / ')} 文件`);
  }

  if (!existsSync(target)) throw new Error(`文件不存在：${normalizedInput}`);
  const st = statSync(target);
  if (!st.isFile()) throw new Error('目标不是文件');
  if (st.size > MAX_FILE_BYTES) {
    throw new Error(`文件过大（${(st.size / 1024).toFixed(0)}KB），上限 512KB`);
  }

  return {
    path: relative(root, target).split(sep).join('/'),
    size: st.size,
    content: readFileSync(target, 'utf8'),
  };
}
