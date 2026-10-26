'use client';

import { memo, type CSSProperties } from 'react';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import {
  FileText,
  Frame,
  Image as ImageIcon,
  LayoutTemplate,
  Play,
  StickyNote,
  Terminal,
  Type,
} from 'lucide-react';
import type { CanvasNode, ComfyTaskStatus } from '@/db/schema';
import { COMFY_STATUS_COLOR, COMFY_STATUS_LABEL, NODE_TYPE_LABEL } from '@/lib/constants';
import { cn, stripMarkdown, truncate } from '@/lib/utils';

/** React Flow 节点的 data 结构（所有节点共用一个组件，按 node.nodeType 分支渲染） */
export interface WBNodeData extends Record<string, unknown> {
  node: CanvasNode;
  onEdit: (id: string) => void;
  onRunComfy?: (id: string) => void;
  running?: boolean;
}

export type WBNode = Node<WBNodeData, 'wb'>;

const NODE_ICON = {
  image: ImageIcon,
  prompt: Type,
  comfy_run: Terminal,
  file: FileText,
  group: Frame,
  note: StickyNote,
  template: LayoutTemplate,
} as const;

const HANDLE_STYLE: CSSProperties = { opacity: 0.6 };

function WorkbenchNodeInner({ data, selected }: NodeProps<WBNode>) {
  const { node } = data;
  const Icon = NODE_ICON[node.nodeType] ?? Type;

  /* ------------------------------- 分组框 ------------------------------- */
  if (node.nodeType === 'group') {
    return (
      <div
        className={cn(
          'node-shell h-full w-full rounded-md border border-dashed bg-app-panel/40',
          selected ? 'border-ink' : 'border-line-strong',
        )}
      >
        <div className="flex items-center gap-1.5 px-2 py-1 text-2xs text-ink-secondary">
          <Frame className="h-3 w-3" />
          <span className="truncate">{node.title || '分组'}</span>
        </div>
      </div>
    );
  }

  const status = (node.meta?.status as ComfyTaskStatus | undefined) ?? 'idle';
  const progress = (node.meta?.progress as number | undefined) ?? 0;

  return (
    <div
      className={cn(
        'node-shell flex h-full w-full flex-col overflow-hidden rounded-md border bg-app-panel',
        selected ? 'border-ink' : 'border-line',
      )}
    >
      {/* 连线锚点 */}
      <Handle type="target" position={Position.Left} style={HANDLE_STYLE} />
      <Handle type="source" position={Position.Right} style={HANDLE_STYLE} />

      {/* 标题栏 */}
      <div className="flex h-7 shrink-0 items-center gap-1.5 border-b border-line px-2">
        <Icon className="h-3 w-3 shrink-0 text-ink-muted" />
        <span className="min-w-0 flex-1 truncate text-2xs text-ink-secondary">
          {node.title || NODE_TYPE_LABEL[node.nodeType]}
        </span>
        {node.nodeType === 'comfy_run' && (
          <span
            className="flex shrink-0 items-center gap-1 text-[10px]"
            style={{ color: COMFY_STATUS_COLOR[status] }}
          >
            <span
              className={cn(
                'h-1.5 w-1.5 rounded-full',
                (status === 'running' || status === 'queued') && 'animate-progress-pulse',
              )}
              style={{ backgroundColor: COMFY_STATUS_COLOR[status] }}
            />
            {COMFY_STATUS_LABEL[status]}
          </span>
        )}
      </div>

      {/* 内容区 */}
      <div className="min-h-0 flex-1 overflow-hidden p-2">
        {node.nodeType === 'image' && <ImageBody node={node} />}
        {node.nodeType === 'prompt' && <PromptBody node={node} />}
        {node.nodeType === 'note' && (
          <p className="whitespace-pre-wrap break-words text-2xs leading-5 text-ink-secondary">
            {node.content || '双击编辑…'}
          </p>
        )}
        {node.nodeType === 'comfy_run' && (
          <ComfyBody node={node} status={status} progress={progress} onRun={data.onRunComfy} />
        )}
        {node.nodeType === 'file' && <FileBody node={node} />}
        {node.nodeType === 'template' && <TemplateBody node={node} />}
      </div>
    </div>
  );
}

/* ------------------------------- 各类型内容 ------------------------------- */

function ImageBody({ node }: { node: CanvasNode }) {
  if (!node.imagePath) {
    return (
      <div className="flex h-full items-center justify-center text-2xs text-ink-muted">
        暂无图片
      </div>
    );
  }
  return (
    <div className="flex h-full flex-col">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={node.imagePath}
        alt={node.title}
        className="min-h-0 w-full flex-1 rounded-sm object-contain"
      />
      {node.meta?.positivePrompt && (
        <p className="mt-1 shrink-0 truncate text-[10px] text-ink-muted">
          {truncate(String(node.meta.positivePrompt), 80)}
        </p>
      )}
    </div>
  );
}

function PromptBody({ node }: { node: CanvasNode }) {
  const text = stripMarkdown(node.content);
  return (
    <p className="h-full overflow-hidden whitespace-pre-wrap break-words text-2xs leading-5 text-ink-secondary">
      {text ? truncate(text, 600) : '双击编辑提示词…'}
    </p>
  );
}

function ComfyBody({
  node,
  status,
  progress,
  onRun,
}: {
  node: CanvasNode;
  status: ComfyTaskStatus;
  progress: number;
  onRun?: (id: string) => void;
}) {
  const hasWorkflow = Boolean(node.meta?.workflowJson);
  return (
    <div className="flex h-full flex-col">
      <p className="min-h-0 flex-1 overflow-hidden text-2xs leading-5 text-ink-muted">
        {hasWorkflow
          ? truncate(String(node.meta?.promptOverride || node.content || ''), 160) ||
            '已载入工作流'
          : '尚未载入工作流'}
      </p>

      {(status === 'running' || status === 'queued') && (
        <div className="mt-1.5 shrink-0">
          <div className="h-1 w-full overflow-hidden rounded-full bg-app-active">
            <div
              className="h-full rounded-full transition-[width] duration-300"
              style={{
                width: `${Math.max(2, progress)}%`,
                backgroundColor: COMFY_STATUS_COLOR[status],
              }}
            />
          </div>
        </div>
      )}

      <div className="mt-1.5 flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRun?.(node.id);
          }}
          className="nodrag inline-flex h-6 items-center gap-1 rounded-sm bg-app-inverse px-1.5 text-[10px] text-ink-inverse transition-opacity hover:opacity-90"
        >
          <Play className="h-2.5 w-2.5" />
          运行
        </button>
        <span className="truncate text-[10px] text-ink-muted">
          {node.meta?.comfyHost ?? '默认实例'}
        </span>
      </div>
    </div>
  );
}

function FileBody({ node }: { node: CanvasNode }) {
  return (
    <div className="flex h-full flex-col justify-center">
      <p className="break-all text-2xs leading-5 text-ink-secondary">
        {node.filePath || '未设置路径'}
      </p>
      <p className="mt-1 text-[10px] text-ink-muted">仅记录路径，不读取文件</p>
    </div>
  );
}

function TemplateBody({ node }: { node: CanvasNode }) {
  const vars = (node.meta?.variables as string[] | undefined) ?? [];
  return (
    <div className="flex h-full flex-col">
      <p className="min-h-0 flex-1 overflow-hidden whitespace-pre-wrap break-words text-2xs leading-5 text-ink-secondary">
        {truncate(node.content, 400) || '模板内容为空'}
      </p>
      {vars.length > 0 && (
        <div className="mt-1 flex shrink-0 flex-wrap gap-1">
          {vars.slice(0, 6).map((v) => (
            <span
              key={v}
              className="rounded-sm border border-line px-1 text-[10px] text-ink-muted"
            >
              {`{{${v}}}`}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export const WorkbenchNode = memo(WorkbenchNodeInner);
export const nodeTypes = { wb: WorkbenchNode };