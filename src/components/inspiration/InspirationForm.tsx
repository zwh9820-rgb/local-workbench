'use client';

import { useEffect, useState } from 'react';
import { Controller, useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, Save, Trash2 } from 'lucide-react';
import type { Inspiration, InspirationStatus, InspirationType } from '@/db/schema';
import { INSPIRATION_STATUS, INSPIRATION_TYPE } from '@/db/schema';
import {
  INSPIRATION_STATUS_LABEL,
  INSPIRATION_TYPE_LABEL,
} from '@/lib/constants';
import { joinTags, parseTags } from '@/lib/utils';
import {
  inspirationCreateSchema,
  type InspirationCreateInput,
} from '@/lib/validation';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select, Textarea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { MarkdownEditor } from '@/components/editor/MarkdownEditor';

type FormValues = {
  title: string;
  summary: string;
  content: string;
  type: InspirationType;
  status: InspirationStatus;
  progress: number;
  tagsText: string;
  localPath: string;
};

/**
 * 灵感新建 / 编辑表单
 * react-hook-form + Zod 校验，Markdown 正文支持代码高亮
 */
export function InspirationForm({
  open,
  initial,
  defaults,
  onClose,
  onSubmit,
  onDelete,
}: {
  open: boolean;
  /** 编辑态：传入完整条目 */
  initial?: Inspiration | null;
  /** 新建态的预填值（例如从剪贴板导入） */
  defaults?: Partial<InspirationCreateInput> | null;
  onClose: () => void;
  onSubmit: (payload: InspirationCreateInput) => Promise<void>;
  onDelete?: () => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(inspirationCreateSchema) as unknown as Resolver<FormValues>,
    defaultValues: {
      title: '',
      summary: '',
      content: '',
      type: 'note',
      status: 'ongoing',
      progress: 0,
      tagsText: '',
      localPath: '',
    },
  });

  // 打开时同步初始值（编辑优先，其次预填，最后空表单）
  useEffect(() => {
    if (!open) return;
    const src = initial ?? defaults;
    reset({
      title: src?.title ?? '',
      summary: src?.summary ?? '',
      content: src?.content ?? '',
      type: src?.type ?? 'note',
      status: src?.status ?? 'ongoing',
      progress: src?.progress ?? 0,
      tagsText: joinTags(src?.tags as string[] | undefined),
      localPath: src?.localPath ?? '',
    });
  }, [open, initial, defaults, reset]);

  const submit = handleSubmit(async (values) => {
    setSaving(true);
    try {
      await onSubmit({
        title: values.title.trim(),
        summary: values.summary?.trim() || null,
        content: values.content ?? '',
        type: values.type,
        status: values.status,
        progress: Number(values.progress) || 0,
        tags: parseTags(values.tagsText ?? ''),
        localPath: values.localPath?.trim() || null,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title={initial ? '编辑灵感' : '新建灵感'}
      desc="提示词 / ComfyUI 工作流 / 漫剧脚本 / 短视频素材统一存放于此"
      bodyClassName="max-h-[74vh] overflow-y-auto"
      footer={
        <>
          {initial && onDelete && (
            <Button
              size="sm"
              variant="danger"
              className="mr-auto"
              onClick={() => void onDelete()}
            >
              <Trash2 size={13} /> 删除
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button size="sm" variant="primary" onClick={() => void submit()} loading={saving}>
            <Save size={13} /> 保存
          </Button>
        </>
      }
    >
      <div className="space-y-3.5">
        <Field label="标题" required error={errors.title?.message}>
          <Input
            {...register('title')}
            placeholder="例如：漫剧分镜提示词 · 赛博夜雨"
            autoFocus
          />
        </Field>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="类型">
            <Select {...register('type')}>
              {INSPIRATION_TYPE.map((t) => (
                <option key={t} value={t}>
                  {INSPIRATION_TYPE_LABEL[t]}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="状态">
            <Select {...register('status')}>
              {INSPIRATION_STATUS.map((s) => (
                <option key={s} value={s}>
                  {INSPIRATION_STATUS_LABEL[s]}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="进度">
            <Controller
              control={control}
              name="progress"
              render={({ field }) => (
                <div className="flex h-9 items-center gap-2">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={field.value}
                    onChange={(e) => field.onChange(Number(e.target.value))}
                    className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-brand-100 accent-brand-500"
                  />
                  <span className="w-9 text-right text-xs tabular-nums text-ink-700">
                    {field.value}%
                  </span>
                </div>
              )}
            />
          </Field>
        </div>

        <Field label="摘要" hint="列表卡片展示用，一句话即可">
          <Textarea {...register('summary')} rows={2} placeholder="一句话说明这条素材解决什么问题" />
        </Field>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="标签" hint="逗号分隔，例如：漫剧, 分镜, 提示词">
            <Input {...register('tagsText')} placeholder="漫剧, 分镜" />
          </Field>
          <Field label="本地文件路径" hint="仅记录，Agent 不会读写该路径">
            <Input
              {...register('localPath')}
              placeholder="D:/assets/comfy/workflows/xxx.json"
              className="font-mono text-[12px]"
            />
          </Field>
        </div>

        <Field label="正文（Markdown）">
          <Controller
            control={control}
            name="content"
            render={({ field }) => (
              <MarkdownEditor value={field.value} onChange={field.onChange} height={320} />
            )}
          />
        </Field>

        {saving && (
          <p className="flex items-center gap-1.5 text-[11px] text-ink-500">
            <Loader2 size={11} className="animate-spin" /> 正在保存…
          </p>
        )}
      </div>
    </Modal>
  );
}
