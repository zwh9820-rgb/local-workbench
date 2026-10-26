'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, RotateCcw, Save } from 'lucide-react';
import type { DailyReview } from '@/db/schema';
import { saveReview } from '@/server/actions/review';
import { PageScroll } from '@/components/layout/page-container';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/input';
import { Card, PageHeader, SectionHeader } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/badge';
import { MarkdownEditor } from '@/components/markdown/markdown-editor';
import { REVIEW_TEMPLATE } from '@/lib/constants';
import { cn, dateKey, timeAgo } from '@/lib/utils';

const MOODS = [
  { value: 'great', label: '很好' },
  { value: 'ok', label: '一般' },
  { value: 'bad', label: '糟糕' },
] as const;

export function ReviewEditor({
  initialDate,
  initialReview,
  history,
}: {
  initialDate: string;
  initialReview: DailyReview | null;
  history: Array<{ reviewDate: string; summary: string | null; updatedAt: Date }>;
}) {
  const router = useRouter();
  const [date, setDate] = useState(initialDate);
  const [content, setContent] = useState(initialReview?.content ?? REVIEW_TEMPLATE);
  const [summary, setSummary] = useState(initialReview?.summary ?? '');
  const [mood, setMood] = useState<'great' | 'ok' | 'bad' | ''>(
    (initialReview?.mood as 'great' | 'ok' | 'bad') ?? '',
  );
  const [score, setScore] = useState<number | ''>(initialReview?.score ?? '');
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [, startTransition] = useTransition();

  const today = dateKey();
  const isToday = date === today;

  // 切日期时重新取数据（服务端渲染，简单可靠）
  const switchDate = (next: string) => {
    setDate(next);
    router.push(`/review?date=${next}`);
  };

  const save = async () => {
    setSaving(true);
    try {
      await saveReview({
        reviewDate: date,
        content,
        summary: summary || null,
        mood: mood || null,
        score: score === '' ? null : Number(score),
      });
      setSaved(true);
      startTransition(() => router.refresh());
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  const historyList = useMemo(
    () => history.filter((h) => h.reviewDate !== date).slice(0, 12),
    [history, date],
  );

  return (
    <PageScroll maxWidth="max-w-[1000px]">
      <PageHeader
        title="今日复盘"
        description={isToday ? '记录今天做了什么、卡在哪里、明天怎么走' : `正在查看 ${date}`}
        actions={
          <div className="flex items-center gap-2">
            <Input
              type="date"
              value={date}
              max={today}
              onChange={(e) => switchDate(e.target.value)}
              className="h-7 w-[136px] text-xs"
            />
            <Button
              variant="primary"
              size="sm"
              icon={saved ? <Check /> : <Save />}
              onClick={save}
              loading={saving}
            >
              {saved ? '已保存' : '保存'}
            </Button>
          </div>
        }
      />

      <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_240px]">
        <div className="space-y-3">
          {/* 元信息 */}
          <Card className="grid grid-cols-2 gap-3 p-3 sm:grid-cols-3">
            <Field label="一句话总结">
              <Input
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                placeholder="今天的关键词"
                className="h-7 text-xs"
              />
            </Field>
            <Field label="状态">
              <Select
                value={mood}
                onChange={(e) => setMood(e.target.value as typeof mood)}
                className="h-7 text-xs"
              >
                <option value="">未选</option>
                {MOODS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="完成度（0-10）">
              <Input
                type="number"
                min={0}
                max={10}
                value={score}
                onChange={(e) =>
                  setScore(e.target.value === '' ? '' : Number(e.target.value))
                }
                className="h-7 text-xs"
              />
            </Field>
          </Card>

          {/* Markdown 正文 */}
          <div>
            <SectionHeader
              title="复盘正文"
              actions={
                <Button
                  variant="text"
                  size="sm"
                  icon={<RotateCcw />}
                  onClick={() => setContent(REVIEW_TEMPLATE)}
                >
                  插入模板
                </Button>
              }
            />
            <MarkdownEditor value={content} onChange={setContent} height={440} />
          </div>
        </div>

        {/* 历史 */}
        <aside>
          <SectionHeader title="历史复盘" count={historyList.length} />
          <Card className="overflow-hidden">
            {historyList.length === 0 ? (
              <p className="px-3 py-4 text-center text-2xs text-ink-muted">
                还没有历史记录
              </p>
            ) : (
              <ul className="divide-y divide-line">
                {historyList.map((h) => (
                  <li key={h.reviewDate}>
                    <button
                      type="button"
                      onClick={() => switchDate(h.reviewDate)}
                      className={cn(
                        'w-full px-3 py-2 text-left transition-colors hover:bg-app-hover',
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-ink">{h.reviewDate}</span>
                        <span className="text-2xs text-ink-muted">
                          {timeAgo(h.updatedAt)}
                        </span>
                      </div>
                      {h.summary && (
                        <p className="mt-0.5 truncate text-2xs text-ink-muted">
                          {h.summary}
                        </p>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <div className="mt-3">
            <StatusBadge
              tone={initialReview ? 'success' : 'idle'}
              label={initialReview ? '这一天已复盘' : '这一天还没写'}
            />
          </div>
        </aside>
      </div>
    </PageScroll>
  );
}
