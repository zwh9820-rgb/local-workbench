import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AppShell } from '@/components/layout/app-shell';

export const metadata: Metadata = {
  title: {
    default: '内容工作台',
    template: '%s · 内容工作台',
  },
  description: '本地 AI 内容生产工作台：无限画布 + ComfyUI 调度 + 内嵌 Agent',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0f0f0f' },
  ],
};

/**
 * 首屏防闪烁脚本：在 hydration 之前根据 localStorage 决定 <html class="dark">
 * 与 zustand persist 的存储键保持一致（workbench-ui）
 */
const themeScript = `
(function(){
  try {
    var raw = localStorage.getItem('workbench-ui');
    var mode = 'system';
    if (raw) {
      var parsed = JSON.parse(raw);
      if (parsed && parsed.state && parsed.state.theme) mode = parsed.state.theme;
    }
    var dark = mode === 'dark' || (mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    var root = document.documentElement;
    root.classList.toggle('dark', dark);
    root.style.colorScheme = dark ? 'dark' : 'light';
    root.setAttribute('data-color-mode', dark ? 'dark' : 'light');
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="font-sans antialiased">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
