import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';

/**
 * 应用数据目录解析（Web / Tauri 双模式）
 *
 * 为什么单独抽一层？
 * - Web 开发态：数据落在项目根 ./data，方便随时删库重来
 * - Tauri 打包后：Rust 侧在启动 sidecar 时注入 WORKBENCH_DATA_DIR，
 *   指向 %APPDATA%\<bundle identifier>，业务代码不需要关心平台差异
 *
 * 目录结构（Tauri 模式）：
 *   %APPDATA%\com.local.workbench\
 *   ├─ workbench.db          SQLite 数据库（含 -wal / -shm）
 *   ├─ ai-material\          Agent 唯一可读的素材目录
 *   └─ backups\              导出备份默认落盘位置
 */

/** 与 tauri.conf.json 的 identifier 保持一致 */
export const APP_ID = 'com.local.workbench';

/** Rust 侧注入的环境变量名 */
export const DATA_DIR_ENV = 'WORKBENCH_DATA_DIR';

/** 素材目录环境变量（优先级最高，便于测试时临时指向别处） */
export const MATERIAL_DIR_ENV = 'WORKBENCH_MATERIAL_DIR';

/** 是否运行在 Tauri 注入的数据目录下（用于 UI 提示 / 日志） */
export function isDesktopRuntime(): boolean {
  return Boolean(process.env[DATA_DIR_ENV]);
}

/** 数据根目录（始终返回规范化后的绝对路径） */
export function getDataRoot(): string {
  const raw = process.env[DATA_DIR_ENV]?.trim();
  // 必须走 resolve 而不是直接用 isAbsolute 判断：
  // 环境变量可能带正斜杠（C:/Users/...），Windows 下会和 path.join 的结果
  // 分隔符不一致，导致后面的 startsWith 校验误判。
  if (raw) return resolve(raw);
  return resolve(process.cwd(), 'data');
}

/** SQLite 文件路径 */
export function getDbFile(): string {
  // 兼容老配置：DATABASE_URL 仍然优先（Web 开发态常用）
  const legacy = process.env.DATABASE_URL?.trim();
  if (legacy) return resolve(legacy);
  return join(getDataRoot(), 'workbench.db');
}

/** 备份导出目录 */
export function getBackupDir(): string {
  return join(getDataRoot(), 'backups');
}

/**
 * 素材目录（Agent 白名单根）
 *
 * 解析优先级：
 * 1. WORKBENCH_MATERIAL_DIR / AI_MATERIAL_DIR 显式指定
 * 2. 桌面模式 → <data>/ai-material
 * 3. Web 模式且存在 public/assets/ai-material → 沿用旧目录，避免已有素材"消失"
 * 4. 兜底 <data>/ai-material
 */
export function getMaterialDir(): string {
  const override =
    process.env[MATERIAL_DIR_ENV]?.trim() || process.env.AI_MATERIAL_DIR?.trim();
  if (override) return resolve(override);

  if (isDesktopRuntime()) return join(getDataRoot(), 'ai-material');

  const legacy = resolve(process.cwd(), 'public', 'assets', 'ai-material');
  if (existsSync(legacy)) return legacy;

  return join(getDataRoot(), 'ai-material');
}

/** 首次启动写入的素材说明文件 */
const MATERIAL_README = `# 素材目录（Agent 白名单）

这是 Agent **唯一**允许读取的文件区域。

- 允许类型：.md / .markdown / .json / .txt
- 单文件上限：512KB
- 只能使用相对路径，例如 workflows/xxx.json
- 禁止绝对路径、禁止 .. 穿越、禁止任何写入与执行

把常用的 ComfyUI 工作流、提示词笔记、调试日志放进来，
然后在 Agent 面板右上角把模式切到「文件读取」。
`;

const SAMPLE_WORKFLOW = `{
  "_comment": "示例工作流片段，可删除",
  "3": {
    "class_type": "KSampler",
    "inputs": { "steps": 28, "cfg": 6.5, "sampler_name": "dpmpp_2m", "scheduler": "karras" }
  }
}
`;

/**
 * 确保数据目录结构存在。
 * 在数据库连接前调用一次即可（init 里已建表，这里只建目录）。
 */
export function ensureDataDirs(): void {
  const dirs = [getDataRoot(), getMaterialDir(), getBackupDir()];
  for (const dir of dirs) {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }

  // 素材目录为空时放一份说明 + 示例，避免用户打开 Agent 文件模式看到空白
  const material = getMaterialDir();
  try {
    if (existsSync(material) && readdirSync(material).length === 0) {
      writeFileSync(join(material, 'README.md'), MATERIAL_README, 'utf8');
      mkdirSync(join(material, 'workflows'), { recursive: true });
      writeFileSync(
        join(material, 'workflows', 'sample.json'),
        SAMPLE_WORKFLOW,
        'utf8',
      );
    }
  } catch {
    // 目录不可写时静默失败，不影响主流程
  }
}

/** 判断某个绝对路径是否位于数据根目录内（导入备份时做二次校验） */
export function isInsideDataRoot(target: string): boolean {
  const root = getDataRoot();
  const abs = resolve(target);
  // Windows 路径大小写不敏感，统一小写后比较
  const same = (a: string, b: string) =>
    process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
  const prefix = (a: string, b: string) =>
    process.platform === 'win32'
      ? a.toLowerCase().startsWith(b.toLowerCase())
      : a.startsWith(b);

  return same(abs, root) || prefix(abs, root + sep);
}
