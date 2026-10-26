'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  SelectionMode,
  addEdge,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeChange,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  ArrowLeft,
  Check,
  FileText,
  Frame,
  LayoutTemplate,
  Plus,
  StickyNote,
  Terminal,
  Trash2,
  Type,
} from 'lucide-react';
import type {
  Canvas,
  CanvasEdge,
  CanvasNode,
  CanvasNodeMeta,
  NodeType,
} from '@/db/schema';
import {
  createCanvasNode,
  deleteCanvasNodes,
  saveEdges,
  saveNodePositions,
  saveViewState,
  setCanvasTemplate,
  updateCanvasNode,
} from '@/server/actions/canvas';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Textarea } from '@/components/ui/input';
import { MarkdownEditor } from '@/components/markdown/markdown-editor';
import { nodeTypes, type WBNode, type WBNodeData } from '@/components/canvas/node-components';
import { NODE_DEFAULT_SIZE, NODE_TYPE_LABEL } from '@/lib/constants';
import { cn, debounce, uuid } from '@/lib/utils';

/* ------------------------------ 类型转换 -------------------------------- */

function toFlowNode(n: CanvasNode, onEdit: (id: string) => void): WBNode {
  return {
    id: n.id,
    type: 'wb',
    position: { x: n.positionX, y: n.positionY },
    data: { node: n, onEdit },
    style: { width: n.width, height: n.height, zIndex: n.zIndex },
    width: n.width,
    height: n.height,
    zIndex: n.zIndex,
  };
}

function toFlowEdge(e: CanvasEdge): Edge {
  return {
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle ?? undefined,
    targetHandle: e.targetHandle ?? undefined,
    type: e.type ?? 'default',
    label: e.label,
    animated: e.animated,
  };
}

const ADD_MENU: Array<{ type: NodeType; label: string; icon: typeof Type }> = [
  { type: 'prompt', label: '提示词', icon: Type },
  { type: 'note', label: '便签', icon: StickyNote },
  { type: 'comfy_run', label: 'ComfyUI', icon: Terminal },
  { type: 'group', label: '分组框', icon: Frame },
  { type: 'file', label: '文件路径', icon: FileText },
  { type: 'template', label: '模板节点', icon: LayoutTemplate },
];

/* -------------------------------- 主组件 -------------------------------- */

export function CanvasEditor({
  canvas,
  nodes: initialNodes,
  focusId,
}: {
  canvas: Canvas;
  nodes: CanvasNode[];
  focusId?: string;
}) {
  return (
    <ReactFlowProvider>
      <EditorInner canvas={canvas} initialNodes={initialNodes} focusId={focusId} />
    </ReactFlowProvider>
  );
}

function EditorInner({
  canvas,
  initialNodes,
  focusId,
}: {
  canvas: Canvas;
  initialNodes: CanvasNode[];
  focusId?: string;
}) {
  const router = useRouter();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition, setCenter } = useReactFlow();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [isTemplate, setIsTemplate] = useState(canvas.isTemplate);

  const onEdit = useCallback((id: string) => setEditingId(id), []);

  const [rfNodes, setRfNodes, onNodesChange] = useNodesState<WBNode>(
    initialNodes.map((n) => toFlowNode(n, onEdit)),
  );
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState<Edge>(
    canvas.edges.map(toFlowEdge),
  );

  // 节点 id → DB 行（编辑弹窗、批量保存时用）
  const nodeMap = useMemo(() => {
    const map = new Map<string, CanvasNode>();
    for (const n of initialNodes) map.set(n.id, n);
    return map;
  }, [initialNodes]);

  /* ------------------------------ 保存逻辑 ------------------------------ */

  const flashSaved = useCallback(() => setSavedAt(Date.now()), []);

  // 位置保存（拖拽结束触发一次）
  const persistPositions = useCallback(
    async (nodes: WBNode[]) => {
      try {
        await saveNodePositions(
          canvas.id,
          nodes.map((n) => ({ id: n.id, x: n.position.x, y: n.position.y })),
        );
        flashSaved();
      } catch (err) {
        console.error('[canvas] 保存位置失败', err);
      }
    },
    [canvas.id, flashSaved],
  );

  const onNodeDragStop = useCallback(() => {
    void persistPositions(rfNodes);
  }, [persistPositions, rfNodes]);

  // 视口保存（防抖）
  const persistViewport = useMemo(
    () =>
      debounce((vp: { x: number; y: number; zoom: number }) => {
        void saveViewState(canvas.id, vp);
      }, 600),
    [canvas.id],
  );

  /* ------------------------------ 连线逻辑 ------------------------------ */

  const onConnect = useCallback(
    (conn: Connection) => {
      const next = addEdge({ ...conn, id: uuid() }, rfEdges);
      setRfEdges(next);
      void saveEdges(
        canvas.id,
        next.map((e) => ({
          id: e.id,
          source: e.source,
          target: e.target,
          sourceHandle: e.sourceHandle ?? null,
          targetHandle: e.targetHandle ?? null,
          type: e.type,
        })),
      );
      flashSaved();
    },
    [canvas.id, rfEdges, setRfEdges, flashSaved],
  );

  // 删除连线也要落库
  const handleEdgesChange = useCallback(
    (changes: Parameters<typeof onEdgesChange>[0]) => {
      onEdgesChange(changes);
      const removed = changes.some((c) => c.type === 'remove');
      if (removed) {
        // 等 React Flow 应用变更后再读最新 edges
        setTimeout(() => {
          setRfEdges((current) => {
            void saveEdges(
              canvas.id,
              current.map((e) => ({
                id: e.id,
                source: e.source,
                target: e.target,
                sourceHandle: e.sourceHandle ?? null,
                targetHandle: e.targetHandle ?? null,
                type: e.type,
              })),
            );
            return current;
          });
        }, 0);
      }
    },
    [canvas.id, onEdgesChange, setRfEdges],
  );

  /* ------------------------------ 新增节点 ------------------------------ */

  const addNode = useCallback(
    async (type: NodeType) => {
      const rect = wrapperRef.current?.getBoundingClientRect();
      const center = screenToFlowPosition({
        x: (rect?.left ?? 0) + (rect?.width ?? 800) / 2,
        y: (rect?.top ?? 0) + (rect?.height ?? 600) / 2,
      });

      const size = NODE_DEFAULT_SIZE[type];
      // 稍微错开，避免连续新增完全重叠
      const offset = rfNodes.length % 6;

      const defaults: Record<string, Partial<CanvasNode>> = {
        prompt: { title: '提示词', content: '' },
        note: { title: '便签', content: '' },
        comfy_run: { title: 'ComfyUI 任务', content: '' },
        group: { title: '分组', content: '' },
        file: { title: '文件', content: '' },
        template: { title: '模板', content: '' },
        image: { title: '图片', content: '' },
      };

      const meta: CanvasNodeMeta =
        type === 'comfy_run'
          ? { status: 'idle', progress: 0, workflowJson: null }
          : type === 'template'
            ? { variables: [] }
            : {};

      const row = await createCanvasNode({
        canvasId: canvas.id,
        nodeType: type,
        title: defaults[type]?.title ?? NODE_TYPE_LABEL[type],
        content: '',
        positionX: center.x - size.width / 2 + offset * 24,
        positionY: center.y - size.height / 2 + offset * 24,
        width: size.width,
        height: size.height,
        zIndex: type === 'group' ? -1 : rfNodes.length,
        meta,
      });

      setRfNodes((prev) => [...prev, toFlowNode(row, onEdit)]);
      setAddOpen(false);
      flashSaved();
    },
    [canvas.id, rfNodes.length, screenToFlowPosition, setRfNodes, onEdit, flashSaved],
  );

  /* ------------------------------ 删除节点 ------------------------------ */

  const deleteSelected = useCallback(async () => {
    const ids = rfNodes.filter((n) => n.selected).map((n) => n.id);
    if (ids.length === 0) return;
    setRfNodes((prev) => prev.filter((n) => !ids.includes(n.id)));
    setRfEdges((prev) =>
      prev.filter((e) => !ids.includes(e.source) && !ids.includes(e.target)),
    );
    await deleteCanvasNodes(canvas.id, ids);
    flashSaved();
  }, [rfNodes, setRfNodes, setRfEdges, canvas.id, flashSaved]);

  /* ------------------------------ 快捷键 -------------------------------- */

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const editing =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable;
      if (editing) return;

      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        void deleteSelected();
      }
      if (e.key === 'Escape') {
        setAddOpen(false);
        setEditingId(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [deleteSelected]);

  /* --------------------------- 定位到目标节点 --------------------------- */

  useEffect(() => {
    if (!focusId) return;
    const target = initialNodes.find((n) => n.id === focusId);
    if (!target) return;
    setCenter(
      target.positionX + target.width / 2,
      target.positionY + target.height / 2,
      { zoom: 1, duration: 500 },
    );
    setRfNodes((prev) =>
      prev.map((n) => ({ ...n, selected: n.id === focusId })),
    );
    // 只跑一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId]);

  /* ------------------------------ 编辑弹窗 ------------------------------ */

  const editingNode = editingId ? nodeMap.get(editingId) ?? null : null;

  const handleNodeSaved = (updated: CanvasNode) => {
    setRfNodes((prev) =>
      prev.map((n) =>
        n.id === updated.id
          ? {
              ...n,
              data: { ...n.data, node: updated },
              style: { ...n.style, width: updated.width, height: updated.height },
              width: updated.width,
              height: updated.height,
            }
          : n,
      ),
    );
    router.refresh();
  };

  /* -------------------------------- 渲染 -------------------------------- */

  return (
    <div className="flex h-full flex-col">
      {/* 顶部工具条 */}
      <div className="flex h-topbar shrink-0 items-center gap-2 border-b border-line bg-app px-3">
        <button
          type="button"
          onClick={() => router.push('/canvas')}
          className="flex h-7 items-center gap-1 rounded-md px-1.5 text-xs text-ink-secondary transition-colors hover:bg-app-hover hover:text-ink"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          画布
        </button>

        <div className="h-4 w-px bg-line" />

        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">
          {canvas.name}
        </span>

        <span className="shrink-0 text-2xs text-ink-muted">
          {savedAt ? '已保存' : `${rfNodes.length} 个节点`}
        </span>

        <div className="relative">
          <Button
            variant="primary"
            size="sm"
            icon={<Plus />}
            onClick={() => setAddOpen((v) => !v)}
          >
            添加
          </Button>

          {addOpen && (
            <div className="absolute right-0 top-[calc(100%+6px)] z-40 w-[168px] overflow-hidden rounded-md border border-line bg-app py-1 shadow-float animate-slide-up">
              {ADD_MENU.map((m) => {
                const Icon = m.icon;
                return (
                  <button
                    key={m.type}
                    type="button"
                    onClick={() => void addNode(m.type)}
                    className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs text-ink-secondary transition-colors hover:bg-app-hover hover:text-ink"
                  >
                    <Icon className="h-3.5 w-3.5 text-ink-muted" />
                    {m.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <Button
          variant="ghost"
          size="sm"
          icon={isTemplate ? <Check /> : <LayoutTemplate />}
          onClick={async () => {
            const next = !isTemplate;
            setIsTemplate(next);
            await setCanvasTemplate(canvas.id, next);
          }}
        >
          {isTemplate ? '模板' : '存为模板'}
        </Button>
      </div>

      {/* 画布 */}
      <div ref={wrapperRef} className="min-h-0 flex-1">
        <ReactFlow
          nodes={rfNodes}
          edges={rfEdges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange as (c: NodeChange<WBNode>[]) => void}
          onEdgesChange={handleEdgesChange}
          onConnect={onConnect}
          onNodeDragStop={onNodeDragStop}
          onNodeDoubleClick={(_, node) => setEditingId(node.id)}
          onMoveEnd={(_, vp) => persistViewport(vp)}
          defaultViewport={canvas.viewState}
          minZoom={0.2}
          maxZoom={2.5}
          selectionOnDrag
          selectionMode={SelectionMode.Partial}
          panOnDrag={[1, 2]}
          panActivationKeyCode="Space"
          deleteKeyCode={null}
          proOptions={{ hideAttribution: true }}
          className="bg-[var(--canvas-bg)]"
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={16}
            size={1}
            color="var(--canvas-dot)"
          />
          <Controls showInteractive={false} position="bottom-right" />
        </ReactFlow>
      </div>

      {/* 底部状态条 */}
      <div className="flex h-7 shrink-0 items-center justify-between border-t border-line bg-app px-3 text-[10px] text-ink-muted">
        <span>左键框选 · 空格/右键拖拽平移 · 滚轮缩放 · Delete 删除选中</span>
        <span className="flex items-center gap-2">
          {rfNodes.filter((n) => n.selected).length > 0 && (
            <button
              type="button"
              onClick={() => void deleteSelected()}
              className="flex items-center gap-1 transition-colors hover:text-[var(--error)]"
            >
              <Trash2 className="h-2.5 w-2.5" />
              删除选中（{rfNodes.filter((n) => n.selected).length}）
            </button>
          )}
        </span>
      </div>

      <NodeEditorDialog
        node={editingNode}
        onClose={() => setEditingId(null)}
        onSaved={handleNodeSaved}
      />
    </div>
  );
}

/* ------------------------------ 节点编辑弹窗 ----------------------------- */

function NodeEditorDialog({
  node,
  onClose,
  onSaved,
}: {
  node: CanvasNode | null;
  onClose: () => void;
  onSaved: (n: CanvasNode) => void;
}) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [filePath, setFilePath] = useState('');
  const [promptOverride, setPromptOverride] = useState('');
  const [workflowText, setWorkflowText] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!node) return;
    setTitle(node.title);
    setContent(node.content);
    setFilePath(node.filePath ?? '');
    setPromptOverride(String(node.meta?.promptOverride ?? ''));
    setWorkflowText(
      node.meta?.workflowJson ? JSON.stringify(node.meta.workflowJson, null, 2) : '',
    );
    setError(null);
  }, [node]);

  if (!node) return null;

  const isMarkdown =
    node.nodeType === 'prompt' ||
    node.nodeType === 'note' ||
    node.nodeType === 'template';

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const meta: CanvasNodeMeta = { ...(node.meta ?? {}) };

      if (node.nodeType === 'comfy_run') {
        meta.promptOverride = promptOverride;
        if (workflowText.trim()) {
          try {
            meta.workflowJson = JSON.parse(workflowText);
          } catch {
            throw new Error('工作流 JSON 格式不正确');
          }
        } else {
          meta.workflowJson = null;
        }
      }

      if (node.nodeType === 'template') {
        const vars = Array.from(content.matchAll(/\{\{\s*([\w-]+)\s*\}\}/g)).map(
          (m) => m[1],
        );
        meta.variables = Array.from(new Set(vars));
      }

      const updated = await updateCanvasNode(node.id, {
        title,
        content,
        filePath: node.nodeType === 'file' ? filePath : undefined,
        meta,
      });
      onSaved(updated);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={`编辑${NODE_TYPE_LABEL[node.nodeType]}节点`}
      size={isMarkdown || node.nodeType === 'comfy_run' ? 'lg' : 'md'}
      closeOnBackdrop={false}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>
            取消
          </Button>
          <Button variant="primary" size="sm" onClick={save} loading={saving}>
            保存
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="标题">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>

        {isMarkdown && (
          <Field label="内容（Markdown）" error={error ?? undefined}>
            <MarkdownEditor value={content} onChange={setContent} height={280} />
          </Field>
        )}

        {node.nodeType === 'file' && (
          <Field label="本地路径" hint="仅记录，不读取文件">
            <Input
              value={filePath}
              onChange={(e) => setFilePath(e.target.value)}
              placeholder="D:\\素材\\参考图.png"
            />
          </Field>
        )}

        {node.nodeType === 'comfy_run' && (
          <>
            <Field label="提示词覆盖" hint="会替换工作流中的正向提示词文本，支持 {{变量}}">
              <Textarea
                value={promptOverride}
                onChange={(e) => setPromptOverride(e.target.value)}
                rows={3}
                placeholder="a cyberpunk city at night, neon rain…"
              />
            </Field>
            <Field label="工作流 JSON" error={error ?? undefined} hint="可粘贴 ComfyUI API 格式工作流">
              <textarea
                value={workflowText}
                onChange={(e) => setWorkflowText(e.target.value)}
                spellCheck={false}
                className="h-[180px] w-full resize-y rounded-md border border-line bg-app p-2 font-mono text-[11px] leading-5 text-ink focus:border-line-strong focus:outline-none"
                placeholder='{ "3": { "class_type": "KSampler", ... } }'
              />
            </Field>
          </>
        )}
      </div>
    </Dialog>
  );
}
