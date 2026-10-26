/**
 * 本地素材存储
 * ----------------------------------------------------------------------------
 * 粘贴/拖入的图片、视频统一落在 data/assets/ 下，通过 /api/assets/<name> 访问。
 *
 * 为什么不存进数据库：图片是二进制大对象，塞 SQLite 会让库迅速膨胀、
 * 备份也变慢。这里只存文件 + 元数据（元数据挂在 canvas_node.meta 里）。
 *
 * Tauri 打包后 APP_DATA_DIR 指向 %APPDATA%，素材跟着用户数据走。
 */
import fs from 'node:fs';
import path from 'node:path';
import { uuid } from '@/lib/utils';

/** 素材根目录 */
export function assetsDir(): string {
  const base = process.env.APP_DATA_DIR
    ? path.resolve(process.cwd(), process.env.APP_DATA_DIR)
    : path.join(process.cwd(), 'data');
  const dir = path.join(base, 'assets');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** 允许的扩展名（白名单，防路径穿越） */
const ALLOWED_EXT = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
  '.avif',
  '.bmp',
  '.mp4',
  '.webm',
  '.mov',
]);

const MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
};

export function mimeByExt(ext: string): string {
  return MIME_BY_EXT[ext.toLowerCase()] ?? 'application/octet-stream';
}

/** 从 MIME 推断扩展名 */
export function extFromMime(mime: string): string {
  if (mime.includes('png')) return '.png';
  if (mime.includes('jpeg') || mime.includes('jpg')) return '.jpg';
  if (mime.includes('webp')) return '.webp';
  if (mime.includes('gif')) return '.gif';
  if (mime.includes('avif')) return '.avif';
  if (mime.includes('mp4')) return '.mp4';
  if (mime.includes('webm')) return '.webm';
  if (mime.includes('quicktime')) return '.mov';
  return '.bin';
}

/** 文件名安全校验：只允许 [a-z0-9-_.] 且必须落在白名单扩展名内 */
export function isSafeName(name: string): boolean {
  if (!name || name.length > 120) return false;
  if (!/^[A-Za-z0-9._-]+$/.test(name)) return false;
  if (name.includes('..')) return false;
  const ext = path.extname(name).toLowerCase();
  return ALLOWED_EXT.has(ext);
}

export interface SavedAsset {
  filename: string;
  /** 前端访问地址 */
  url: string;
  size: number;
  ext: string;
}

/* ------------------------------ 元数据索引 ------------------------------ */
/**
 * 素材的生成信息（尺寸/模型/参数）在上传时解析一次，存进 index.json。
 * 列表页直接读索引，避免每次打开素材库都去解一遍 PNG。
 */
export interface AssetMeta {
  width?: number;
  height?: number;
  title?: string;
  positivePrompt?: string;
  negativePrompt?: string;
  params?: Record<string, unknown>;
  size: number;
  createdAt: number;
}

type AssetIndex = Record<string, AssetMeta>;

function indexPath(): string {
  return path.join(assetsDir(), 'index.json');
}

export function readIndex(): AssetIndex {
  try {
    const raw = fs.readFileSync(indexPath(), 'utf8');
    const parsed = JSON.parse(raw) as AssetIndex;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeIndex(idx: AssetIndex): void {
  try {
    fs.writeFileSync(indexPath(), JSON.stringify(idx), 'utf8');
  } catch {
    /* 索引写失败不影响主流程 */
  }
}

export function upsertIndex(filename: string, meta: AssetMeta): void {
  const idx = readIndex();
  idx[filename] = meta;
  writeIndex(idx);
}

export function removeIndex(filename: string): void {
  const idx = readIndex();
  delete idx[filename];
  writeIndex(idx);
}

/** 保存素材，返回访问地址 */
export function saveAsset(buffer: Buffer, mimeOrExt: string): SavedAsset {
  const ext = mimeOrExt.startsWith('.')
    ? mimeOrExt.toLowerCase()
    : extFromMime(mimeOrExt);

  if (!ALLOWED_EXT.has(ext)) {
    throw new Error(`不支持的素材类型：${ext}`);
  }

  const filename = `${Date.now().toString(36)}-${uuid().slice(0, 8)}${ext}`;
  const full = path.join(assetsDir(), filename);

  fs.writeFileSync(full, buffer);

  return {
    filename,
    url: `/api/assets/${filename}`,
    size: buffer.length,
    ext,
  };
}

/** 读取素材（含防穿越校验） */
export function readAsset(name: string): { buffer: Buffer; mime: string } | null {
  if (!isSafeName(name)) return null;
  const full = path.join(assetsDir(), name);
  if (!fs.existsSync(full)) return null;
  return {
    buffer: fs.readFileSync(full),
    mime: mimeByExt(path.extname(name)),
  };
}

/** 删除素材（文件不存在也视为成功） */
export function removeAsset(name: string): boolean {
  if (!isSafeName(name)) return false;
  const full = path.join(assetsDir(), name);
  if (!fs.existsSync(full)) return false;
  fs.unlinkSync(full);
  removeIndex(name);
  return true;
}

export interface AssetItem {
  filename: string;
  url: string;
  size: number;
  mtime: number;
  ext: string;
  kind: 'image' | 'video';
  width?: number;
  height?: number;
  title?: string;
  positivePrompt?: string;
  params?: Record<string, unknown>;
}

/** 列出素材（按修改时间倒序，合并索引里的生成信息） */
export function listAssets(limit = 300): AssetItem[] {
  const dir = assetsDir();
  const index = readIndex();

  const names = fs
    .readdirSync(dir)
    .filter((n) => isSafeName(n));

  return names
    .map((n) => {
      const st = fs.statSync(path.join(dir, n));
      const ext = path.extname(n).toLowerCase();
      const meta = index[n];
      return {
        filename: n,
        url: `/api/assets/${n}`,
        size: st.size,
        mtime: st.mtimeMs,
        ext,
        kind: (['.mp4', '.webm', '.mov'].includes(ext) ? 'video' : 'image') as
          | 'image'
          | 'video',
        width: meta?.width,
        height: meta?.height,
        title: meta?.title,
        positivePrompt: meta?.positivePrompt,
        params: meta?.params,
      };
    })
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, limit);
}
