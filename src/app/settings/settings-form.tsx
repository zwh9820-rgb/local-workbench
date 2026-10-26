'use client';

import { useState } from 'react';
import { Check, Download, Plus, Save, Trash2, Upload } from 'lucide-react';
import type { AppSettings } from '@/server/settings';
import { saveAppSettings } from '@/server/actions/settings';
import { PageScroll } from '@/components/layout/page-container';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { Card, CardHeader, PageHeader } from '@/components/ui/card';
import { ThemeSegmented } from '@/components/layout/theme-toggle';
import { DEFAULT_COMFY_HOST, DEFAULT_LM_STUDIO_HOST } from '@/lib/constants';
import { uuid } from '@/lib/utils';

export function SettingsForm({
  initial,
  dbPath,
  settingsPath,
}: {
  initial: AppSettings;
  dbPath: string;
  settingsPath: string;
}) {
  const [comfyInstances, setComfyInstances] = useState(initial.comfyInstances);
  const [lm, setLm] = useState(initial.lmStudio);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await saveAppSettings({
        ...initial,
        comfyInstances,
        lmStudio: lm,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageScroll maxWidth="max-w-[760px]">
      <PageHeader
        title="设置"
        description="所有配置只保存在本机，不会上传"
        actions={
          <Button
            variant="primary"
            size="sm"
            icon={saved ? <Check /> : <Save />}
            onClick={save}
            loading={saving}
          >
            {saved ? '已保存' : '保存'}
          </Button>
        }
      />

      <div className="mt-4 space-y-4">
        {/* 外观 */}
        <Card>
          <CardHeader title="外观" />
          <div className="flex items-center justify-between px-3 py-3">
            <div>
              <p className="text-xs text-ink">明暗模式</p>
              <p className="mt-0.5 text-2xs text-ink-muted">
                黑白灰极简主题，仅状态标记使用少量彩色
              </p>
            </div>
            <ThemeSegmented />
          </div>
        </Card>

        {/* ComfyUI */}
        <Card>
          <CardHeader
            title="ComfyUI"
            extra={
              <Button
                variant="text"
                size="sm"
                icon={<Plus />}
                onClick={() =>
                  setComfyInstances((prev) => [
                    ...prev,
                    { id: uuid(), name: `实例 ${prev.length + 1}`, host: DEFAULT_COMFY_HOST },
                  ])
                }
              >
                添加实例
              </Button>
            }
          />
          <div className="space-y-2 px-3 py-3">
            {comfyInstances.map((inst, idx) => (
              <div key={inst.id} className="flex items-center gap-2">
                <Input
                  value={inst.name}
                  onChange={(e) =>
                    setComfyInstances((prev) =>
                      prev.map((p) =>
                        p.id === inst.id ? { ...p, name: e.target.value } : p,
                      ),
                    )
                  }
                  className="h-7 w-[132px] text-xs"
                  placeholder="实例名"
                />
                <Input
                  value={inst.host}
                  onChange={(e) =>
                    setComfyInstances((prev) =>
                      prev.map((p) =>
                        p.id === inst.id ? { ...p, host: e.target.value } : p,
                      ),
                    )
                  }
                  className="h-7 flex-1 text-xs"
                  placeholder={DEFAULT_COMFY_HOST}
                />
                {idx === 0 ? (
                  <span className="shrink-0 text-2xs text-ink-muted">默认</span>
                ) : (
                  <button
                    type="button"
                    onClick={() =>
                      setComfyInstances((prev) => prev.filter((p) => p.id !== inst.id))
                    }
                    className="shrink-0 rounded-sm p-1 text-ink-muted transition-colors hover:text-[var(--error)]"
                    aria-label="删除实例"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
            <p className="pt-1 text-2xs leading-5 text-ink-muted">
              工作台不会启动 ComfyUI，请先手动运行 ComfyUI 并保持
              <code className="mx-1 rounded-sm bg-app-hover px-1">--listen</code>
              默认端口 8188。
            </p>
          </div>
        </Card>

        {/* LM Studio */}
        <Card>
          <CardHeader title="LM Studio（Agent）" />
          <div className="grid grid-cols-1 gap-3 px-3 py-3 sm:grid-cols-2">
            <Field label="服务地址" hint="OpenAI 兼容接口，以 /v1 结尾">
              <Input
                value={lm.baseUrl}
                onChange={(e) => setLm({ ...lm, baseUrl: e.target.value })}
                placeholder={DEFAULT_LM_STUDIO_HOST}
                className="h-7 text-xs"
              />
            </Field>
            <Field label="模型名" hint="需支持 function calling 的 DeepSeek 系列">
              <Input
                value={lm.model}
                onChange={(e) => setLm({ ...lm, model: e.target.value })}
                className="h-7 text-xs"
              />
            </Field>
            <Field label="温度">
              <Input
                type="number"
                step="0.1"
                min={0}
                max={2}
                value={lm.temperature}
                onChange={(e) => setLm({ ...lm, temperature: Number(e.target.value) })}
                className="h-7 text-xs"
              />
            </Field>
            <Field label="最大工具调用轮数" hint="防止 Agent 陷入循环">
              <Input
                type="number"
                min={1}
                max={20}
                value={lm.maxSteps}
                onChange={(e) => setLm({ ...lm, maxSteps: Number(e.target.value) })}
                className="h-7 text-xs"
              />
            </Field>
          </div>
        </Card>

        {/* 数据 */}
        <Card>
          <CardHeader title="数据与备份" />
          <div className="space-y-3 px-3 py-3">
            <div className="space-y-1">
              <p className="text-2xs text-ink-muted">数据库</p>
              <p className="break-all rounded-sm bg-app-hover px-2 py-1 font-mono text-[11px] text-ink-secondary">
                {dbPath}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-2xs text-ink-muted">设置文件</p>
              <p className="break-all rounded-sm bg-app-hover px-2 py-1 font-mono text-[11px] text-ink-secondary">
                {settingsPath}
              </p>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <a
                href="/api/backup/export"
                className="inline-flex h-7 items-center gap-1 rounded-md border border-line px-2 text-xs text-ink-secondary transition-colors hover:bg-app-hover hover:text-ink"
              >
                <Download className="h-3.5 w-3.5" />
                导出备份（zip）
              </a>
              <button
                type="button"
                disabled
                title="下一阶段开放"
                className="inline-flex h-7 cursor-not-allowed items-center gap-1 rounded-md border border-line px-2 text-xs text-ink-muted opacity-50"
              >
                <Upload className="h-3.5 w-3.5" />
                导入备份
              </button>
            </div>
            <p className="text-2xs leading-5 text-ink-muted">
              导出内容包含 SQLite 快照与设置文件，不含 ComfyUI / LM Studio 的任何数据。
              导入功能将在下一阶段提供（需要先关闭正在运行的实例）。
            </p>
          </div>
        </Card>
      </div>
    </PageScroll>
  );
}
