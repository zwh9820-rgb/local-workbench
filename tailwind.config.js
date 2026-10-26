/** @type {import('tailwindcss').Config} */
/**
 * 黑白极简灰度主题
 * ----------------------------------------------------------------------------
 * 设计原则：
 *  1. 所有语义色都走 CSS 变量（定义在 src/app/globals.css），
 *     这样明暗切换只需在 <html> 上增删 `dark` class，零闪烁、零重渲染。
 *  2. 唯一允许的彩色只有 status 三色（success / error / warning），
 *     且只用于状态点、进度条、错误提示，禁止用于大面积背景或装饰。
 *  3. 圆角克制（最大 8px），阴影几乎不用，靠 1px 描边建立层次。
 *
 * 命名速查：
 *   bg-app / bg-app-panel / bg-app-hover      → 背景层级
 *   border-line / border-line-strong          → 描边层级
 *   text-ink / text-ink-secondary / text-ink-muted → 文字层级
 *   bg-status-success 等                       → 状态色（少量）
 */
module.exports = {
  darkMode: 'class',
  content: [
    './src/app/**/*.{ts,tsx,mdx}',
    './src/components/**/*.{ts,tsx}',
    './src/features/**/*.{ts,tsx}',
    './src/lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        app: {
          DEFAULT: 'var(--bg)',
          panel: 'var(--panel)',
          hover: 'var(--panel-hover)',
          active: 'var(--panel-active)',
          inverse: 'var(--bg-inverse)',
        },
        line: {
          DEFAULT: 'var(--border)',
          strong: 'var(--border-strong)',
        },
        ink: {
          DEFAULT: 'var(--text-primary)',
          secondary: 'var(--text-secondary)',
          muted: 'var(--text-muted)',
          inverse: 'var(--text-inverse)',
        },
        status: {
          success: '#34a853',
          error: '#ea4335',
          warning: '#f59e0b',
        },
      },
      fontFamily: {
        sans: [
          'var(--font-sans)',
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Microsoft YaHei',
          'PingFang SC',
          'sans-serif',
        ],
        mono: [
          'var(--font-mono)',
          'ui-monospace',
          'SFMono-Regular',
          'JetBrains Mono',
          'Consolas',
          'monospace',
        ],
      },
      fontSize: {
        '2xs': ['11px', { lineHeight: '16px', letterSpacing: '0.01em' }],
      },
      borderRadius: {
        DEFAULT: '6px',
        sm: '4px',
        md: '6px',
        lg: '8px',
        xl: '10px',
      },
      boxShadow: {
        // 只用极轻的浮层阴影，避免"花哨"
        panel: '0 1px 2px rgba(0,0,0,0.04)',
        float: '0 8px 24px rgba(0,0,0,0.12)',
      },
      spacing: {
        sidebar: '232px',
        topbar: '48px',
      },
      transitionDuration: {
        DEFAULT: '150ms',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.98)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        // ComfyUI 运行中的进度条呼吸效果
        'progress-pulse': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.45' },
        },
        // Agent 思考中的三点动画
        'dot-bounce': {
          '0%, 80%, 100%': { transform: 'translateY(0)', opacity: '0.4' },
          '40%': { transform: 'translateY(-3px)', opacity: '1' },
        },
      },
      animation: {
        'fade-in': 'fade-in 150ms ease-out',
        'slide-up': 'slide-up 180ms ease-out',
        'scale-in': 'scale-in 120ms ease-out',
        'progress-pulse': 'progress-pulse 1.4s ease-in-out infinite',
        'dot-bounce': 'dot-bounce 1.2s infinite ease-in-out',
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
};
