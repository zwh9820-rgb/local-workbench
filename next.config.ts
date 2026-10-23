import type { NextConfig } from 'next';

/**
 * Next.js 配置（Web + Tauri 桌面双模式）
 *
 * - serverExternalPackages: better-sqlite3 是原生模块，必须交给 Node runtime 直接 require
 * - output=standalone: 仅在 BUILD_TARGET=tauri 时启用，产物供 Tauri sidecar 直接 `node server.js`
 * - CSP: 网络白名单，connect-src 只放行本机 + LM Studio(1234)，其他外部请求一律拦掉
 */

const isDev = process.env.NODE_ENV !== 'production';
const isTauriBuild = process.env.BUILD_TARGET === 'tauri';

/**
 * 内容安全策略（网络白名单的核心）
 *
 * connect-src 只允许：
 *  - 'self'              应用自身的 /api/*
 *  - 127.0.0.1:1234      LM Studio（Agent 在服务端调用，这里主要给调试面板留口子）
 *  - ws://localhost:*    开发态 HMR
 * 其他外部域名（含任何云端 API）都会被 WebView 直接拒绝。
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' http://127.0.0.1:1234 http://localhost:1234 ws://127.0.0.1:* ws://localhost:*",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
].join('; ');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  serverExternalPackages: ['better-sqlite3'],
  // Tauri 打包时输出 standalone，Rust 侧用 node server.js 直接跑
  ...(isTauriBuild ? { output: 'standalone' as const } : {}),
  eslint: {
    ignoreDuringBuilds: true,
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
        ],
      },
    ];
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '8mb',
    },
  },
};

export default nextConfig;
