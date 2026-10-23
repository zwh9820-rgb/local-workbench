import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '本地个人工作台',
  description: '本地 SQLite + 内嵌 LM Studio Agent 的个人创作工作台',
  applicationName: '本地工作台',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: '本地工作台', statusBarStyle: 'default' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#1F4E5F',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" data-color-mode="light">
      <body className="min-h-screen bg-paper text-ink-900">{children}</body>
    </html>
  );
}
