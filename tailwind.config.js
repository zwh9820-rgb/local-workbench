/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './src/app/**/*.{ts,tsx,mdx}',
    './src/components/**/*.{ts,tsx}',
    './src/lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#F0F7F9',
          100: '#D9ECF2',
          200: '#A8D5E3',
          300: '#6FB7CC',
          400: '#3D97B5',
          500: '#1F4E5F',
          600: '#1A3F4F',
          700: '#15313E',
          800: '#10242E',
          900: '#0B181F',
        },
        ink: {
          900: '#1F2937',
          700: '#374151',
          500: '#6B7280',
          300: '#D1D5DB',
        },
        paper: {
          DEFAULT: '#F7F6F3',
          card: '#FFFFFF',
        },
        status: {
          active: '#2563EB',
          paused: '#D97706',
          done: '#059669',
          abandoned: '#DC2626',
        },
      },
      fontFamily: {
        sans: [
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          '"Segoe UI"',
          '"PingFang SC"',
          '"Microsoft YaHei"',
          'sans-serif',
        ],
        mono: ['"JetBrains Mono"', 'Consolas', '"Courier New"', 'monospace'],
      },
      borderRadius: {
        card: '0.75rem',
      },
      boxShadow: {
        card: '0 1px 2px rgba(16, 36, 46, 0.06), 0 1px 3px rgba(16, 36, 46, 0.04)',
        float: '0 8px 24px rgba(16, 36, 46, 0.12)',
      },
      transitionDuration: {
        DEFAULT: '150ms',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(12px) scale(0.99)' },
          to: { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        blink: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.25' },
        },
      },
      animation: {
        'fade-in': 'fade-in 160ms ease-out both',
        'slide-up': 'slide-up 180ms cubic-bezier(0.16, 1, 0.3, 1) both',
        blink: 'blink 1.1s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
