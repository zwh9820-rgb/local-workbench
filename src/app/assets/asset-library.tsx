'use client';

import { useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Copy, ImagePlus, Search, Trash2, Upload, X } from 'lucide-react';
import { PageScroll } from '@/components/layout/page-container';
import { Button } from '@/components/ui/button';
import { Dialog, ConfirmDialog } from '@/components/ui/dialog';
import { Card, EmptyState, PageHeader } from '@/components/ui/card';
import { Chip } from '@/components/ui/badge';
import { cn, timeAgo, truncate } from '@/lib/utils';
import { ASSET_DND_MIME } from '@/lib/constants';

export interface AssetItemUI {
  filename: string;
  url: string;
  size: number;
  mtime: number;
  kind: 'image' | 'video';
  width?: number;
  height?: number;
  title?: string;
  positivePrompt?: string;
  params?: Record<string, unknown>;
}

type KindFilter = 'all' | 'image' | 'video';

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function AssetLibrary({ initialItems }: { initialItems: AssetItemUI[] }) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [kind, setKind] = useState<KindFilter>('all');
  const [keyword, setKeyword] = useState('');
  const [preview, setPreview] = useState<AssetItemUI | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AssetItemUI | null>(null);
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [, startTransition] = useTransition();

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2400);
  };

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return items.filter((a) => {
      if (kind !== 'all' && a.kind !== kind) return false;
      if (!kw) return true;
      return (
        (a.title ?? '').toLowerCase().includes(kw) ||
        a.filename.toLowerCase().includes(kw) ||
        (a.positivePrompt ?? '').toLowerCase().includes(kw)
      );
    });
  }, [items, kind, keyword]);

  /* ------------------------------ 上传 ------------------------------ */

  const uploadFiles = async (files: File[]) => {
    if (files.length === 0) return;
    setUploading(true);
    try {
      for (const f of files) {
        const fd = new FormData();
        fd.append('file', f, f.name);
        const res = await fetch('/api/assets/upload', { method: 'POST', body: fd });
        const data = (await res.json()) as {
          ok?: boolean;
          url?: string;
          filename?: string;
          title?: string;
          width?: number;
          height?: number;
          positivePrompt?: string;
          params?: Record<string, unknown>;
          size?: number;
          ext?: string;
          error?: string;
        };
        if (!res.ok || !data.url) throw new Error(data.error ?? '上传失败');

        setItems((prev) => [
          {
            filename: data.filename!,
            url: data.url!,
            size: data.size ?? f.size,
            mtime: Date.now(),
            kind: ['.mp4', '.webm', '.mov'].includes(data.ext ?? '')
              ? 'video'
              : 'image',
            width: data.width,
            height: data.height,
            title: data.title,
            positivePrompt: data.positivePrompt,
            params: data.params,
          },
          ...prev,
        ]);
      }
      showToast(`已上传 ${files.length} 个文件`);
      router.refresh();
    } catch (err) {
      showToast(err instanceof Error ? err.message : '上传失败');
    } finally {
      setUploading(false);
    }
  };

  /* ------------------------------ 删除 ------------------------------ */

  const doDelete = async () => {
    if (!deleteTarget) return;
    const name = deleteTarget.filename;
    setItems((prev) => prev.filter((a) => a.filename !== name));
    setDeleteTarget(null);
    setPreview(null);
    startTransition(async () => {
      await fetch(`/api/assets/${name}`, { method: 'DELETE' });
      router.refresh();
    });
  };

  return (
    <PageScroll>
      <PageHeader
        title="素材库"
        description={`${items.length} 个素材 · 拖到画布上即可使用`}
        actions={
          <Button
            variant="primary"
            size="sm"
            icon={<Upload />}
            loading={uploading}
            onClick={() => fileRef.current?.click()}
          >
            上传
          </Button>
        }
      />

      {/* 筛选 */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Chip active={kind === 'all'} onClick={() => setKind('all')}>
            全部
          </Chip>
          <Chip active={kind === 'image'} onClick={() => setKind('image')}>
            图片
          </Chip>
          <Chip active={kind === 'video'} onClick={() => setKind('video')}>
            视频
          </Chip>
        </div>

        <div className="relative ml-auto">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-muted" />
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜标题 / 提示词…"
            className="h-7 w-[200px] rounded-md border border-line bg-app pl-7 pr-2 text-xs text-ink placeholder:text-ink-muted focus:border-line-strong focus:outline-none"
          />
        </div>
      </div>

      {/* 网格 */}
      {filtered.length === 0 ? (
        <Card className="mt-3">
          <EmptyState
            icon={<ImagePlus />}
            title={items.length === 0 ? '素材库是空的' : '没有匹配的素材'}
            description={
              items.length === 0
                ? '在画布里 Ctrl+V 粘贴图片，或在这里点「上传」。之后可以随时拖回画布复用。'
                : '换个关键词或筛选条件试试。'
            }
            action={
              items.length === 0 ? (
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<Upload />}
                  onClick={() => fileRef.current?.click()}
                >
                  上传素材
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {filtered.map((a) => (
            <div
              key={a.filename}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData(
                  ASSET_DND_MIME,
                  JSON.stringify({
                    url: a.url,
                    title: a.title,
                    width: a.width,
                    height: a.height,
                    params: a.params,
                    positivePrompt: a.positivePrompt,
                    kind: a.kind,
                  }),
                );
                e.dataTransfer.effectAllowed = 'copy';
              }}
              onClick={() => setPreview(a)}
              className="group relative cursor-grab overflow-hidden rounded-md border border-line bg-app-panel transition-colors hover:border-line-strong active:cursor-grabbing"
            >
              <div className="relative aspect-square overflow-hidden bg-app-hover">
                {a.kind === 'video' ? (
                  <video
                    src={a.url}
                    muted
                    className="h-full w-full object-cover"
                  />
                ) : (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={a.url}
                    alt={a.title ?? a.filename}
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                  />
                )}
                {a.kind === 'video' && (
                  <span className="absolute left-1.5 top-1.5 rounded-sm bg-black/60 px-1 text-[10px] text-white">
                    视频
                  </span>
                )}
              </div>

              <div className="px-2 py-1.5">
                <div className="truncate text-2xs text-ink">
                  {a.title || a.filename}
                </div>
                <div className="mt-0.5 flex items-center gap-1 text-[10px] text-ink-muted">
                  {a.width && a.height ? (
                    <span>
                      {a.width}×{a.height}
                    </span>
                  ) : (
                    <span>{formatSize(a.size)}</span>
                  )}
                  <span className="text-line-strong">·</span>
                  <span>{timeAgo(a.mtime)}</span>
                </div>
              </div>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setDeleteTarget(a);
                }}
                aria-label="删除素材"
                className="absolute right-1.5 top-1.5 rounded-sm border border-line bg-app/90 p-1 text-ink-muted opacity-0 transition-all hover:text-[var(--error)] group-hover:opacity-100"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 隐藏的上传 input */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*,video/*"
        multiple
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = '';
          void uploadFiles(files);
        }}
      />

      {/* Toast */}
      {toast && (
        <div className="pointer-events-none fixed left-1/2 top-4 z-[60] -translate-x-1/2">
          <div className="rounded-md border border-line bg-app px-3 py-1.5 text-xs text-ink shadow-float">
            {toast}
          </div>
        </div>
      )}

      {/* 预览 */}
      <Dialog
        open={Boolean(preview)}
        onClose={() => setPreview(null)}
        title={preview?.title || preview?.filename}
        size="xl"
        footer={
          preview ? (
            <div className="flex w-full items-center justify-between">
              <Button
                variant="danger"
                size="sm"
                icon={<Trash2 />}
                onClick={() => setDeleteTarget(preview)}
              >
                删除
              </Button>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<Copy />}
                  onClick={() => {
                    void navigator.clipboard.writeText(preview.url);
                    showToast('已复制访问地址');
                  }}
                >
                  复制地址
                </Button>
                <Button variant="primary" size="sm" onClick={() => setPreview(null)}>
                  关闭
                </Button>
              </div>
            </div>
          ) : null
        }
      >
        {preview && (
          <div className="space-y-3">
            <div className="flex max-h-[52vh] items-center justify-center overflow-hidden rounded-md bg-app-hover">
              {preview.kind === 'video' ? (
                <video src={preview.url} controls className="max-h-[52vh] w-full" />
              ) : (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={preview.url}
                  alt={preview.title ?? preview.filename}
                  className="max-h-[52vh] object-contain"
                />
              )}
            </div>

            {/* 生成参数 */}
            <div className="flex flex-wrap items-center gap-1.5 text-2xs text-ink-muted">
              {preview.width && preview.height && (
                <span className="rounded-sm border border-line px-1.5 py-0.5 text-ink-secondary">
                  {preview.width}×{preview.height}
                </span>
              )}
              {preview.params?.model ? (
                <span className="rounded-sm border border-line px-1.5 py-0.5">
                  {String(preview.params.model).replace(
                    /\.(safetensors|ckpt|pt|gguf)$/i,
                    '',
                  )}
                </span>
              ) : null}
              {preview.params?.sampler ? (
                <span className="rounded-sm border border-line px-1.5 py-0.5">
                  {String(preview.params.sampler)}
                </span>
              ) : null}
              {preview.params?.steps !== undefined && (
                <span>steps {String(preview.params.steps)}</span>
              )}
              {preview.params?.cfg !== undefined && (
                <span>cfg {String(preview.params.cfg)}</span>
              )}
              {preview.params?.seed !== undefined && (
                <span className="truncate">seed {String(preview.params.seed)}</span>
              )}
              <span className="ml-auto">{formatSize(preview.size)}</span>
            </div>

            {preview.positivePrompt && (
              <div>
                <p className="mb-1 text-2xs text-ink-muted">提示词</p>
                <p className="max-h-[120px] overflow-y-auto rounded-md border border-line bg-app-panel p-2 text-xs leading-5 text-ink-secondary">
                  {preview.positivePrompt}
                </p>
              </div>
            )}

            <p className={cn('text-2xs text-ink-muted')}>
              提示：把这张卡片直接拖到画布上即可使用
            </p>
          </div>
        )}
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={doDelete}
        title="删除素材"
        message={`确定删除「${truncate(deleteTarget?.title || deleteTarget?.filename || '', 40)}」？画布上已引用的节点会变成空白。`}
        confirmText="删除"
        danger
      />
    </PageScroll>
  );
}
