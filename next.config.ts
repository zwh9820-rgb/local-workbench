import type { NextConfig } from 'next';

/**
 * Next.js 配置
 * ----------------------------------------------------------------------------
 * 1) serverExternalPackages：better-sqlite3 是原生模块，必须排除在打包之外，
 *    否则 Next 15 的 Server Component 打包会报 "Cannot find module ... .node"。
 * 2) rewrites：开发环境把 /comfy/* 代理到本地 ComfyUI，解决浏览器跨域。
 *    Tauri v2 打包后前端走 Rust 侧 fetch 或直接 http://127.0.0.1:8188，
 *    该代理仅在 dev 生效（生产用 /api/comfy/* 服务端转发）。
 */
const COMFYUI_BASE_URL = process.env.COMFYUI_BASE_URL ?? 'http://127.0.0.1:8188';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ['better-sqlite3'],

  /**
   * standalone 输出
   * ------------------------------------------------------------------
   * 只有打桌面版（Tauri）时才开启：NEXT_OUTPUT=standalone npm run build
   * 产物 .next/standalone 自带精简 node_modules + server.js，
   * 会被 Tauri 作为资源打包，由内置 node.exe 启动（见 src-tauri/）。
   * 平时开发 / 普通部署保持默认，避免 next start 行为变化。
   */
  output: process.env.NEXT_OUTPUT === 'standalone' ? 'standalone' : undefined,

  // 注意：Next 会把运行时 fs 访问到的路径（data/、drizzle/）一并 trace 进
  // standalone 产物，outputFileTracingExcludes 在本版本对它们不生效。
  // 因此统一在 scripts/prepare-desktop.mjs 里做清理，避免本地数据库被打进安装包。

  async rewrites() {
    return [
      {
        source: '/comfy/:path*',
        destination: `${COMFYUI_BASE_URL}/:path*`,
      },
    ];
  },

  // 允许把本地素材目录下的图片直出（file 节点预览用，第一版只读不写）
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
