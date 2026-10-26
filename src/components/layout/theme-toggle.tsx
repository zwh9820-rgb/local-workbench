'use client';

import { useEffect } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { applyTheme, resolveTheme, useUIStore, type ThemeMode } from '@/store/ui';
import { cn } from '@/lib/utils';

/** 明暗切换（图标按钮）：在 light / dark 之间切换 */
export function ThemeToggle({ className }: { className?: string }) {
  const theme = useUIStore((s) => s.theme);
  const setTheme = useUIStore((s) => s.setTheme);

  const resolved = typeof window === 'undefined' ? 'light' : resolveTheme(theme);

  return (
    <button
      type="button"
      onClick={() => setTheme(resolved === 'dark' ? 'light' : 'dark')}
      title={resolved === 'dark' ? '切换到亮色' : '切换到暗色'}
      aria-label="切换明暗模式"
      className={cn(
        'flex h-7 w-7 items-center justify-center rounded-md text-ink-secondary transition-colors hover:bg-app-hover hover:text-ink',
        className,
      )}
    >
      {resolved === 'dark' ? (
        <Moon className="h-4 w-4" strokeWidth={1.75} />
      ) : (
        <Sun className="h-4 w-4" strokeWidth={1.75} />
      )}
    </button>
  );
}

const MODES: Array<{ value: ThemeMode; label: string; icon: typeof Sun }> = [
  { value: 'light', label: '亮色', icon: Sun },
  { value: 'dark', label: '暗色', icon: Moon },
  { value: 'system', label: '跟随系统', icon: Monitor },
];

/** 三段式明暗选择（设置页用） */
export function ThemeSegmented() {
  const theme = useUIStore((s) => s.theme);
  const setTheme = useUIStore((s) => s.setTheme);

  return (
    <div className="inline-flex rounded-md border border-line p-0.5">
      {MODES.map((m) => {
        const Icon = m.icon;
        const active = theme === m.value;
        return (
          <button
            key={m.value}
            type="button"
            onClick={() => setTheme(m.value)}
            className={cn(
              'flex h-7 items-center gap-1.5 rounded-sm px-2.5 text-xs transition-colors',
              active
                ? 'bg-app-inverse text-ink-inverse'
                : 'text-ink-secondary hover:text-ink',
            )}
          >
            <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
            {m.label}
          </button>
        );
      })}
    </div>
  );
}

/** 主题副作用挂载点：跟随 store 变化写 <html> */
export function ThemeEffect() {
  const theme = useUIStore((s) => s.theme);

  useEffect(() => {
    applyTheme(theme);
    if (theme !== 'system') return;

    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => applyTheme('system');
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [theme]);

  return null;
}
