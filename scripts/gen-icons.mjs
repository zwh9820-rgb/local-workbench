/**
 * 生成 Tauri 应用图标（零依赖）
 *
 * 用法：node scripts/gen-icons.mjs
 * 产物：src-tauri/icons/{32x32,128x128,128x128@2x,icon}.png + icon.ico
 *
 * 为什么自己画？
 * 官方 `tauri icon` 需要一张 1024x1024 源图；这里直接按品牌色程序化生成，
 * 保证仓库里始终有可用图标。想换成自己的 logo：
 *   1. 准备 1024x1024 png
 *   2. npx tauri icon path/to/logo.png
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const OUT = resolve(import.meta.dirname, '..', 'src-tauri', 'icons');
mkdirSync(OUT, { recursive: true });

/* ------------------------------ 基础绘制 ------------------------------ */

const BG = [0x1f, 0x4e, 0x5f]; // brand-500
const GLYPH = [0xf0, 0xf7, 0xf9]; // brand-50
const RING = [0x3d, 0x97, 0xb5]; // brand-400

/** 圆角矩形内判定（归一化坐标） */
function insideRoundRect(x, y, r) {
  const min = r;
  const max = 1 - r;
  if (x >= min && x <= max) return y >= 0 && y <= 1;
  if (y >= min && y <= max) return x >= 0 && x <= 1;
  const cx = x < min ? min : max;
  const cy = y < min ? min : max;
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

/** 点到线段距离（归一化坐标） */
function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy || 1;
  let t = ((px - x1) * dx + (py - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = x1 + t * dx;
  const cy = y1 + t * dy;
  return Math.hypot(px - cx, py - cy);
}

// W 的四个笔画（归一化坐标）
const W_STROKES = [
  [0.235, 0.315, 0.365, 0.7],
  [0.365, 0.7, 0.5, 0.44],
  [0.5, 0.44, 0.635, 0.7],
  [0.635, 0.7, 0.765, 0.315],
];

/** 采样一个点：返回 [r,g,b,a] */
function sample(x, y) {
  if (!insideRoundRect(x, y, 0.19)) return [0, 0, 0, 0];

  // 内圈细边，增加层次
  const inner = insideRoundRect(x, y, 0.19) && !insideRoundRect(x, y, 0.155);
  let color = BG;
  if (inner) color = RING;

  let glyph = false;
  for (const [x1, y1, x2, y2] of W_STROKES) {
    if (distToSegment(x, y, x1, y1, x2, y2) < 0.062) {
      glyph = true;
      break;
    }
  }
  if (glyph) color = GLYPH;

  return [color[0], color[1], color[2], 255];
}

/** 超采样渲染：返回 RGBA Buffer（自上而下） */
function render(size, ss = 4) {
  const out = Buffer.alloc(size * size * 4);
  const step = 1 / (size * ss);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const px = (x * ss + sx + 0.5) * step;
          const py = (y * ss + sy + 0.5) * step;
          const c = sample(px, py);
          const alpha = c[3] / 255;
          r += c[0] * alpha;
          g += c[1] * alpha;
          b += c[2] * alpha;
          a += c[3];
        }
      }
      const n = ss * ss;
      const i = (y * size + x) * 4;
      const avgA = a / n;
      // 预乘还原
      const k = avgA > 0 ? 255 / avgA : 0;
      out[i] = Math.min(255, Math.round((r / n) * k));
      out[i + 1] = Math.min(255, Math.round((g / n) * k));
      out[i + 2] = Math.min(255, Math.round((b / n) * k));
      out[i + 3] = Math.round(avgA);
    }
  }
  return out;
}

/* -------------------------------- PNG -------------------------------- */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePNG(size, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  // 每行前加 filter byte 0
  const rowLen = size * 4;
  const raw = Buffer.alloc((rowLen + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (rowLen + 1)] = 0;
    rgba.copy(raw, y * (rowLen + 1) + 1, y * rowLen, (y + 1) * rowLen);
  }

  return Buffer.concat([
    sig,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

/* -------------------------------- ICO -------------------------------- */

/** 单帧 BMP（32bit BGRA + AND mask），ICO 内嵌格式 */
function icoBmp(size, rgba) {
  const header = Buffer.alloc(40);
  header.writeUInt32LE(40, 0);
  header.writeInt32LE(size, 4);
  header.writeInt32LE(size * 2, 8); // 高度含掩码
  header.writeUInt16LE(1, 12);
  header.writeUInt16LE(32, 14);
  header.writeUInt32LE(0, 16); // BI_RGB
  header.writeUInt32LE(size * size * 4, 20);

  const pixels = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    const srcRow = size - 1 - y; // BMP 自下而上
    for (let x = 0; x < size; x++) {
      const s = (srcRow * size + x) * 4;
      const d = (y * size + x) * 4;
      pixels[d] = rgba[s + 2]; // B
      pixels[d + 1] = rgba[s + 1]; // G
      pixels[d + 2] = rgba[s]; // R
      pixels[d + 3] = rgba[s + 3]; // A
    }
  }

  const maskRow = Math.ceil(size / 32) * 4;
  const mask = Buffer.alloc(maskRow * size); // 全 0 = 全部不透明
  return Buffer.concat([header, pixels, mask]);
}

function encodeICO(entries) {
  const dir = Buffer.alloc(6);
  dir.writeUInt16LE(0, 0);
  dir.writeUInt16LE(1, 2);
  dir.writeUInt16LE(entries.length, 4);

  const dirEntries = [];
  const blobs = [];
  let offset = 6 + entries.length * 16;

  for (const { size, data } of entries) {
    const e = Buffer.alloc(16);
    e[0] = size >= 256 ? 0 : size;
    e[1] = size >= 256 ? 0 : size;
    e[2] = 0;
    e[3] = 0;
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(data.length, 8);
    e.writeUInt32LE(offset, 12);
    dirEntries.push(e);
    blobs.push(data);
    offset += data.length;
  }

  return Buffer.concat([dir, ...dirEntries, ...blobs]);
}

/* -------------------------------- 输出 -------------------------------- */

const targets = [
  { name: '32x32.png', size: 32 },
  { name: '128x128.png', size: 128 },
  { name: '128x128@2x.png', size: 256 },
  { name: 'icon.png', size: 512 },
];

for (const t of targets) {
  const png = encodePNG(t.size, render(t.size));
  writeFileSync(join(OUT, t.name), png);
  console.log(`✓ ${t.name} (${(png.length / 1024).toFixed(1)} KB)`);
}

const icoSizes = [16, 32, 48, 256];
const ico = encodeICO(icoSizes.map((size) => ({ size, data: icoBmp(size, render(size)) })));
writeFileSync(join(OUT, 'icon.ico'), ico);
console.log(`✓ icon.ico (${(ico.length / 1024).toFixed(1)} KB, ${icoSizes.join('/')} px)`);

console.log(`\n图标已生成：${OUT}`);
