/**
 * 组装桌面版 sidecar 目录
 * ---------------------------------------------------------------------------
 * 运行：npm run build:standalone && node scripts/prepare-desktop.mjs
 * 产物：src-tauri/resources/app  （由 Tauri 打包进安装包，内置 node 启动）
 *
 * 为什么要单独写脚本：
 *   1. Next 会把 data/ 和 drizzle/ 一并 trace 进 standalone，本地数据库
 *      绝不能进安装包，必须在这里删掉；
 *   2. .next/static 和 public 不会被 standalone 自动带上，要手动复制；
 *   3. 迁移目录必须放在 sidecar 的 cwd 下（db/index.ts 用 cwd/drizzle 定位）。
 *
 * 本地与 GitHub Actions 共用同一套逻辑，避免两边行为漂移。
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const standalone = path.join(root, '.next', 'standalone');
const staticDir = path.join(root, '.next', 'static');
const publicDir = path.join(root, 'public');
const drizzleDir = path.join(root, 'drizzle');
const dest = path.join(root, 'src-tauri', 'resources', 'app');

const log = (msg) => console.log(`[prepare-desktop] ${msg}`);

function fail(msg) {
  console.error(`[prepare-desktop] ✗ ${msg}`);
  process.exit(1);
}

function dirSizeMB(dir) {
  let total = 0;
  const stack = [dir];
  while (stack.length > 0) {
    const cur = stack.pop();
    for (const entry of fs.readdirSync(cur, { withFileTypes: true })) {
      const p = path.join(cur, entry.name);
      if (entry.isDirectory()) stack.push(p);
      else total += fs.statSync(p).size;
    }
  }
  return total / 1024 / 1024;
}

/* ---------------------------- 1. 前置校验 ---------------------------- */

if (!fs.existsSync(standalone)) {
  fail('未找到 .next/standalone，请先执行：NEXT_OUTPUT=standalone npm run build');
}
if (!fs.existsSync(path.join(standalone, 'server.js'))) {
  fail('standalone 产物缺少 server.js');
}

/* ---------------------------- 2. 清空目标目录 ---------------------------- */

fs.rmSync(dest, { recursive: true, force: true });
fs.mkdirSync(dest, { recursive: true });

/* ---------------------------- 3. 复制 standalone ---------------------------- */

fs.cpSync(standalone, dest, { recursive: true });
log(`standalone → resources/app`);

// 关键：本地数据库不能进安装包
const leakedDb = path.join(dest, 'data');
if (fs.existsSync(leakedDb)) {
  fs.rmSync(leakedDb, { recursive: true, force: true });
  log('已移除误带入的 data/（本地数据库）');
}

/* ---------------------------- 4. 静态资源 ---------------------------- */

if (fs.existsSync(staticDir)) {
  fs.cpSync(staticDir, path.join(dest, '.next', 'static'), { recursive: true });
  log('复制 .next/static');
} else {
  fail('.next/static 不存在');
}

if (fs.existsSync(publicDir)) {
  fs.cpSync(publicDir, path.join(dest, 'public'), { recursive: true });
  log('复制 public');
}

/* ---------------------------- 5. 迁移脚本 ---------------------------- */

if (fs.existsSync(drizzleDir)) {
  fs.cpSync(drizzleDir, path.join(dest, 'drizzle'), { recursive: true });
  log('复制 drizzle（运行时自动迁移用）');
} else {
  fail('缺少 drizzle 迁移目录，请先执行 npm run db:generate');
}

/* ---------------------------- 6. 补齐被裁剪的 next 包 ---------------------------- */
/**
 * Next 的 standalone 会裁剪 node_modules/next，但部分文件是通过动态 require
 * 加载的（例如 dist/lib/metadata/get-metadata-route），tracing 抓不到，
 * 会导致 sidecar 启动时报 MODULE_NOT_FOUND。
 * 这里只「补齐缺失文件」，不覆盖已有内容，体积增量最小。
 */
function copyMissing(srcDir, destDir) {
  let copied = 0;
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const s = path.join(srcDir, entry.name);
    const d = path.join(destDir, entry.name);

    if (entry.isDirectory()) {
      // CJS 运行时用不到 esm 副本，跳过可省十几 MB
      if (entry.name === 'esm') continue;
      if (!fs.existsSync(d)) {
        fs.cpSync(s, d, { recursive: true });
        copied += 1;
      } else {
        copied += copyMissing(s, d);
      }
      continue;
    }

    // sourcemap / 类型声明不参与运行
    if (
      entry.name.endsWith('.map') ||
      entry.name.endsWith('.d.ts') ||
      entry.name.endsWith('.d.mts') ||
      entry.name.endsWith('.d.cts')
    ) {
      continue;
    }

    if (!fs.existsSync(d)) {
      fs.copyFileSync(s, d);
      copied += 1;
    }
  }
  return copied;
}

const fullNext = path.join(root, 'node_modules', 'next');
const packagedNext = path.join(dest, 'node_modules', 'next');
if (fs.existsSync(fullNext) && fs.existsSync(packagedNext)) {
  const patched = copyMissing(fullNext, packagedNext);
  log(`补齐 next 包缺失文件：${patched} 项`);
}

/* ---------------------------- 7. 原生模块校验 ---------------------------- */

function findNative(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...findNative(p));
    else if (entry.name.endsWith('.node')) out.push(p);
  }
  return out;
}

const natives = findNative(path.join(dest, 'node_modules', 'better-sqlite3'));
if (natives.length === 0) {
  fail('better-sqlite3 原生模块未被打包（检查 serverExternalPackages 配置）');
}
log(`原生模块：${natives.map((n) => path.relative(dest, n)).join(', ')}`);

/* ---------------------------- 7. 完成 ---------------------------- */

log(`完成 → ${path.relative(root, dest)}（${dirSizeMB(dest).toFixed(1)} MB）`);
log('下一步：npx tauri build（需要 Rust 环境）');
