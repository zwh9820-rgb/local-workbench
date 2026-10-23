/**
 * Tauri sidecar 准备脚本
 *
 * 用法：
 *   node scripts/prepare-sidecar.mjs          仅打包（需先自己跑过 next build）
 *   node scripts/prepare-sidecar.mjs --build  先 next build（standalone）再打包
 *
 * 做四件事：
 *   1. next build（BUILD_TARGET=tauri → output: 'standalone'）
 *   2. 把 .next/static、public 复制进 standalone（Next 不会自动带）
 *   3. 把 standalone 打成单个 src-tauri/resources/server.zip
 *   4. 把当前 Node 运行时复制成 src-tauri/resources/node.exe（ABI 与 better-sqlite3 完全匹配）
 *
 * 为什么打成 zip 而不是散目录：
 *   Tauri 打包 resources 时按 glob 展开，`.next` 这类点开头的目录有被漏掉的风险，
 *   上万个散文件也会拖慢 NSIS。单文件最稳，App 首次启动时解压到 App 数据目录。
 *
 * 产物布局（打包后）：
 *   <安装目录>\node.exe
 *   <安装目录>\server.zip
 * 运行时（首次启动解压）：
 *   %APPDATA%\com.local.workbench\runtime\<版本>\server.js
 */
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, relative, resolve, sep } from 'node:path';
import JSZip from 'jszip';

const ROOT = resolve(import.meta.dirname, '..');
const STANDALONE = join(ROOT, '.next', 'standalone');
const RES_DIR = join(ROOT, 'src-tauri', 'resources');
const SERVER_DIR = join(RES_DIR, 'server'); // 旧目录模式遗留，构建时清理
const ZIP_PATH = join(RES_DIR, 'server.zip');

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
/*  3. 打包成 src-tauri/resources/server.zip                                    */
/* -------------------------------------------------------------------------- */

// better-sqlite3 是 external 包，standalone tracing 偶尔会漏。
// 先用 package.json 判断「整包是否在」，缺整包就整包补，只缺 .node 才单独补。
// （顺序不能反：先 mkdir 出 build/Release 会让 pkgDest 存在，从而误判整包已就位）
const pkgSrc = join(ROOT, 'node_modules', 'better-sqlite3');
const pkgDest = join(STANDALONE, 'node_modules', 'better-sqlite3');
const nativeNode = join(pkgSrc, 'build', 'Release', 'better_sqlite3.node');
const nativeDest = join(pkgDest, 'build', 'Release', 'better_sqlite3.node');

if (existsSync(pkgSrc) && !existsSync(join(pkgDest, 'package.json'))) {
  cpSync(pkgSrc, pkgDest, { recursive: true });
  log('已补拷整个 better-sqlite3 包');
} else if (existsSync(nativeNode) && !existsSync(nativeDest)) {
  mkdirSync(join(nativeDest, '..'), { recursive: true });
  cpSync(nativeNode, nativeDest);
  log('已补拷 better_sqlite3.node');
}

if (!existsSync(join(STANDALONE, 'server.js'))) {
  fail('standalone 内缺少 server.js，检查 next.config.ts 的 output: standalone');
}

mkdirSync(RES_DIR, { recursive: true });
// 清掉旧产物（目录模式遗留 + 旧 zip）
safeRemove(SERVER_DIR);
safeRemove(ZIP_PATH);

/** 递归收集 standalone 下所有文件（相对路径，统一用 /） */
const collect = (dir, base = dir, acc = []) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) collect(full, base, acc);
    else acc.push({ full, rel: relative(base, full).split(sep).join('/') });
  }
  return acc;
};

const files = collect(STANDALONE);
log(`打包 ${files.length} 个文件（含 .next / node_modules）…`);

const zip = new JSZip();
for (const f of files) {
  zip.file(f.rel, readFileSync(f.full));
}
const buf = await zip.generateAsync({
  type: 'nodebuffer',
  compression: 'DEFLATE',
  compressionOptions: { level: 6 },
});
writeFileSync(ZIP_PATH, buf);
log(`已生成 ${ZIP_PATH}（${(buf.byteLength / 1024 / 1024).toFixed(1)} MB）`);

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

const zipMb = (statSync(ZIP_PATH).size / 1024 / 1024).toFixed(1);
const nodeMb = (statSync(nodeDest).size / 1024 / 1024).toFixed(1);
log(`服务端 ${zipMb} MB · Node 运行时 ${nodeMb} MB`);
log('准备完成，可以执行：npm run tauri:build');
