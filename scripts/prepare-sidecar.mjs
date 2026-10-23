/**
 * Tauri sidecar 准备脚本
 *
 * 用法：
 *   node scripts/prepare-sidecar.mjs          仅复制（需先自己跑过 next build）
 *   node scripts/prepare-sidecar.mjs --build  先 next build（standalone）再复制
 *
 * 做四件事：
 *   1. next build（BUILD_TARGET=tauri → output: 'standalone'）
 *   2. 把 .next/static、public 复制进 standalone（Next 不会自动带）
 *   3. 把 standalone 整体复制到 src-tauri/resources/server
 *   4. 把当前 Node 运行时复制成 src-tauri/resources/node.exe（ABI 与 better-sqlite3 完全匹配）
 *
 * 产物布局（打包后）：
 *   <安装目录>\node.exe
 *   <安装目录>\server\server.js
 *   <安装目录>\server\node_modules\...
 */
import { cpSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const STANDALONE = join(ROOT, '.next', 'standalone');
const RES_DIR = join(ROOT, 'src-tauri', 'resources');
const SERVER_DIR = join(RES_DIR, 'server');

const withBuild = process.argv.includes('--build');

function log(msg) {
  console.log(`[sidecar] ${msg}`);
}

function fail(msg) {
  console.error(`[sidecar] ✗ ${msg}`);
  process.exit(1);
}

/** 删除目录；被占用/被拦截时降级为改名，避免脚本中断 */
function safeRemove(dir) {
  if (!existsSync(dir)) return;
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    const bak = `${dir}.bak-${Date.now()}`;
    try {
      renameSync(dir, bak);
      log(`目录被占用，已改名：${bak}`);
    } catch {
      fail(`无法清理 ${dir}，请手动删除后重试`);
    }
  }
}

function dirSize(dir) {
  let total = 0;
  const walk = (p) => {
    for (const entry of readdirSync(p, { withFileTypes: true })) {
      const full = join(p, entry.name);
      if (entry.isDirectory()) walk(full);
      else {
        try {
          total += statSync(full).size;
        } catch {
          /* ignore */
        }
      }
    }
  };
  try {
    walk(dir);
  } catch {
    /* ignore */
  }
  return total;
}

/* -------------------------------------------------------------------------- */
/*  1. next build                                                              */
/* -------------------------------------------------------------------------- */

if (withBuild) {
  log('开始构建 Next.js standalone 产物…');
  const npmCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const result = spawnSync(npmCmd, ['next', 'build'], {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, BUILD_TARGET: 'tauri', NODE_ENV: 'production' },
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) fail('next build 失败');
}

if (!existsSync(STANDALONE)) {
  fail('未找到 .next/standalone，请先执行：npm run build:desktop');
}

/* -------------------------------------------------------------------------- */
/*  2. 补齐 static / public                                                     */
/* -------------------------------------------------------------------------- */

const staticSrc = join(ROOT, '.next', 'static');
const staticDest = join(STANDALONE, '.next', 'static');
if (existsSync(staticSrc)) {
  cpSync(staticSrc, staticDest, { recursive: true });
  log('已复制 .next/static');
} else {
  fail('未找到 .next/static，构建可能未完成');
}

const publicSrc = join(ROOT, 'public');
if (existsSync(publicSrc)) {
  cpSync(publicSrc, join(STANDALONE, 'public'), { recursive: true });
  log('已复制 public/');
}

/* -------------------------------------------------------------------------- */
/*  3. 复制到 src-tauri/resources/server                                        */
/* -------------------------------------------------------------------------- */

safeRemove(SERVER_DIR);
mkdirSync(RES_DIR, { recursive: true });
cpSync(STANDALONE, SERVER_DIR, { recursive: true });
log(`已复制服务端 → ${SERVER_DIR}`);

// better-sqlite3 原生模块兜底：standalone tracing 偶尔会漏掉 .node 文件
const nativeNode = join(
  ROOT,
  'node_modules',
  'better-sqlite3',
  'build',
  'Release',
  'better_sqlite3.node',
);
const nativeDest = join(
  SERVER_DIR,
  'node_modules',
  'better-sqlite3',
  'build',
  'Release',
  'better_sqlite3.node',
);
if (existsSync(nativeNode) && !existsSync(nativeDest)) {
  mkdirSync(join(nativeDest, '..'), { recursive: true });
  cpSync(nativeNode, nativeDest);
  log('已补拷 better_sqlite3.node');
}

if (!existsSync(join(SERVER_DIR, 'server.js'))) {
  fail('standalone 内缺少 server.js，检查 next.config.ts 的 output: standalone');
}

/* -------------------------------------------------------------------------- */
/*  4. 复制 Node 运行时                                                         */
/* -------------------------------------------------------------------------- */

const nodeName = process.platform === 'win32' ? 'node.exe' : 'node';
const nodeDest = join(RES_DIR, nodeName);
try {
  cpSync(process.execPath, nodeDest);
  log(`已复制 Node 运行时 → ${nodeDest}`);
} catch (err) {
  fail(`复制 Node 运行时失败：${err.message}`);
}

/* -------------------------------------------------------------------------- */
/*  汇总                                                                       */
/* -------------------------------------------------------------------------- */

const serverMb = (dirSize(SERVER_DIR) / 1024 / 1024).toFixed(1);
const nodeMb = (statSync(nodeDest).size / 1024 / 1024).toFixed(1);
log(`服务端产物 ${serverMb} MB · Node 运行时 ${nodeMb} MB`);
log('准备完成，可以执行：npm run tauri:build');
