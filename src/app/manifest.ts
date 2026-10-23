import type { MetadataRoute } from 'next';

/** PWA manifest（可选能力，不注册 Service Worker 也能被识别为可安装应用） */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '本地个人工作台',
    short_name: '工作台',
    description: '本地 SQLite + 内嵌 LM Studio Agent 的个人创作工作台',
    start_url: '/',
    display: 'standalone',
    background_color: '#F7F6F3',
    theme_color: '#1F4E5F',
    lang: 'zh-CN',
    icons: [
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
    ],
  };
}
