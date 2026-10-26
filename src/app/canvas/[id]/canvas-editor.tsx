'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
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
  ArrowUpToLine,
  Check,
  Copy,
  FileText,
  Frame,
  LayoutTemplate,
  Map as MapIcon,
  Maximize2,
  Pencil,
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
import { useComfySocket, type ComfySocketEvent } from '@/components/canvas/use-comfy-socket';
import { NODE_DEFAULT_SIZE, NODE_TYPE_LABEL } from '@/lib/constants';
import { cn, debounce, uuid } from '@/lib/utils';

/* ------------------------------ 类型转换 -------------------------------- */

function toFlowNode(
  n: CanvasNode,
  onEdit: (id: string) => void,
  onRunComfy?: (id: string) => void,
  onResize?: (id: string, w: number, h: number) => void,
): WBNode {
  return {
    id: n.id,
    type: 'wb',
    position: { x: n.positionX, y: n.positionY },
    data: { node: n, onEdit, onRunComfy, onResize },
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
  comfyHost = 'http://127.0.0.1:8188',
}: {
  canvas: Canvas;
  nodes: CanvasNode[];
  focusId?: string;
  comfyHost?: string;
}) {
  return (
    <ReactFlowProvider>
      <EditorInner
        canvas={canvas}
        initialNodes={initialNodes}
        focusId={focusId}
        comfyHost={comfyHost}
      />
    </ReactFlowProvider>
  );
}

function EditorInner({
  canvas,
  initialNodes,
  focusId,
  comfyHost,
}: {
  canvas: Canvas;
  initialNodes: CanvasNode[];
  focusId?: string;
  comfyHost: string;
}) {
  const router = useRouter();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition, setCenter, fitView } = useReactFlow();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [isTemplate, setIsTemplate] = useState(canvas.isTemplate);
  const [toast, setToast] = useState<string | null>(null);
  const [showMinimap, setShowMinimap] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    nodeId?: string;
  } | null>(null);

  /* --------------------------- ComfyUI 实时通道 --------------------------- */
  // prompt_id → 画布节点 id（提交时记录，WS 消息只带 prompt_id）
  const promptMapRef = useRef(new Map<string, string>());
  const lastProgressRef = useRef(new Map<string, number>());
  const eventHandlerRef = useRef<(e: ComfySocketEvent) => void>(() => {});
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { connected: comfyConnected, clientId } = useComfySocket(comfyHost, (e) =>
    eventHandlerRef.current(e),
  );

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 3200);
  }, []);

  const onEdit = useCallback((id: string) => setEditingId(id), []);

  /** 提交任务到 ComfyUI（人工点击触发，Agent 不会调） */
  const runComfy = useCallback(
    async (nodeId: string) => {
      showToast('正在提交到 ComfyUI…');
      try {
        const res = await fetch('/api/comfy/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nodeId, clientId }),
        });
        const data = (await res.json()) as { promptId?: string; error?: string };
        if (!res.ok || !data.promptId) throw new Error(data.error ?? '提交失败');

        promptMapRef.current.set(data.promptId, nodeId);
        showToast('已入队，等待 ComfyUI 执行');
        router.refresh();
      } catch (err) {
        showToast(err instanceof Error ? err.message : '提交失败');
      }
    },
    [clientId, router, showToast],
  );

  // 稳定引用：节点组件拿到的回调不随渲染变化，避免整片节点重绘
  const runComfyRef = useRef(runComfy);
  useEffect(() => {
    runComfyRef.current = runComfy;
  }, [runComfy]);
  const onRunComfy = useCallback((id: string) => {
    void runComfyRef.current(id);
  }, []);

  // 尺寸回调同样用 ref 中转，保证初始化时就能挂上
  const resizeRef = useRef<(id: string, w: number, h: number) => void>(() => {});
  const onNodeResizeStable = useCallback((id: string, w: number, h: number) => {
    resizeRef.current(id, w, h);
  }, []);

  const [rfNodes, setRfNodes, onNodesChange] = useNodesState<WBNode>(
    initialNodes.map((n) => toFlowNode(n, onEdit, onRunComfy, onNodeResizeStable)),
  );
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState<Edge>(
    canvas.edges.map(toFlowEdge),
  );

  /** 只改 meta，驱动节点内进度条 */
  const patchNodeMeta = useCallback(
    (nodeId: string, patch: Record<string, unknown>) => {
      setRfNodes((prev) =>
        prev.map((n) =>
          n.id === nodeId
            ? {
                ...n,
                data: {
                  ...n.data,
                  node: {
                    ...n.data.node,
                    meta: { ...(n.data.node.meta ?? {}), ...patch },
                  },
                },
              }
            : n,
        ),
      );
    },
    [setRfNodes],
  );

  /** 拖拽改尺寸：本地先更新，松手后落库 */
  const onNodeResize = useCallback(
    async (id: string, width: number, height: number) => {
      const w = Math.round(width);
      const h = Math.round(height);
      setRfNodes((prev) =>
        prev.map((n) =>
          n.id === id
            ? { ...n, width: w, height: h, style: { ...n.style, width: w, height: h } }
            : n,
        ),
      );
      try {
        await updateCanvasNode(id, { width: w, height: h });
        setSavedAt(Date.now());
      } catch (err) {
        console.error('[canvas] 保存尺寸失败', err);
      }
    },
    [setRfNodes],
  );

  useEffect(() => {
    resizeRef.current = (id, w, h) => void onNodeResize(id, w, h);
  }, [onNodeResize]);

  /** 收集结果：拉历史 → 生成 image 节点 → 刷新画布数据 */
  const collectResult = useCallback(
    async (nodeId: string) => {
      try {
        const res = await fetch('/api/comfy/collect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nodeId }),
        });
        const data = (await res.json()) as {
          ok?: boolean;
          status?: string;
          images?: number;
          error?: string;
        };
        if (!res.ok) throw new Error(data.error ?? '收集失败');

        if (data.status === 'pending') {
          // 还没落盘，稍后再试一次
          setTimeout(() => void collectResult(nodeId), 1500);
          return;
        }

        patchNodeMeta(nodeId, { status: 'done', progress: 100 });
        showToast(
          data.images && data.images > 0
            ? `生成完成，已回填 ${data.images} 张图`
            : '任务完成',
        );
        router.refresh();
      } catch (err) {
        patchNodeMeta(nodeId, { status: 'error', error: '收集结果失败' });
        showToast(err instanceof Error ? err.message : '收集失败');
      }
    },
    [patchNodeMeta, router, showToast],
  );

  /** 进度落库（节流：每涨 5% 报一次） */
  const reportProgress = useCallback((nodeId: string, percent: number) => {
    const last = lastProgressRef.current.get(nodeId) ?? -5;
    if (percent - last < 5 && percent < 100) return;
    lastProgressRef.current.set(nodeId, percent);
    void fetch('/api/comfy/progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nodeId, progress: percent }),
    }).catch(() => {});
  }, []);

  /** WS 事件 → 节点状态 */
  const handleComfyEvent = useCallback(
    (evt: ComfySocketEvent) => {
      if (evt.type === 'open' || evt.type === 'close' || evt.type === 'status') return;

      const nodeId = evt.promptId ? promptMapRef.current.get(evt.promptId) : undefined;
      if (!nodeId) return;

      if (evt.type === 'start') {
        patchNodeMeta(nodeId, { status: 'running', progress: 0 });
        return;
      }

      if (evt.type === 'progress') {
        patchNodeMeta(nodeId, { status: 'running', progress: evt.percent });
        reportProgress(nodeId, evt.percent);
        return;
      }

      if (evt.type === 'done') {
        patchNodeMeta(nodeId, { status: 'running', progress: 100 });
        void collectResult(nodeId);
        return;
      }

      if (evt.type === 'error') {
        patchNodeMeta(nodeId, { status: 'error', error: evt.message });
        showToast(evt.message);
      }
    },
    [patchNodeMeta, reportProgress, collectResult, showToast],
  );

  useEffect(() => {
    eventHandlerRef.current = handleComfyEvent;
  }, [handleComfyEvent]);

  // 服务端数据刷新（例如回填了新 image 节点）→ 重建节点列表
  const nodeSignature = useMemo(
    () =>
      initialNodes
        .map((n) => n.id)
        .sort()
        .join('|'),
    [initialNodes],
  );

  useEffect(() => {
    setRfNodes(initialNodes.map((n) => toFlowNode(n, onEdit, onRunComfy, onNodeResizeStable)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeSignature]);


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

  /** 删除单个节点（右键菜单） */
  const deleteNode = useCallback(
    async (id: string) => {
      setRfNodes((prev) => prev.filter((n) => n.id !== id));
      setRfEdges((prev) =>
        prev.filter((e) => e.source !== id && e.target !== id),
      );
      await deleteCanvasNodes(canvas.id, [id]);
      flashSaved();
    },
    [canvas.id, setRfNodes, setRfEdges, flashSaved],
  );

  /* ------------------------------ 快捷键 -------------------------------- */

  /** 复制节点（Ctrl+D / 右键菜单共用） */
  const duplicateNodes = useCallback(
    async (targets: WBNode[]) => {
      if (targets.length === 0) return;

      const created: CanvasNode[] = [];
      for (const n of targets) {
        const src = n.data.node;
        const row = await createCanvasNode({
          canvasId: canvas.id,
          nodeType: src.nodeType,
          title: src.title,
          content: src.content,
          filePath: src.filePath,
          imagePath: src.imagePath,
          positionX: src.positionX + 36,
          positionY: src.positionY + 36,
          width: src.width,
          height: src.height,
          zIndex: src.zIndex + 1,
          meta: src.meta,
        });
        created.push(row);
      }

      setRfNodes((prev) => [
        ...prev.map((n) => ({ ...n, selected: false })),
        ...created.map((r) => ({
          ...toFlowNode(r, onEdit, onRunComfy, onNodeResizeStable),
          selected: true,
        })),
      ]);
      showToast(`已复制 ${created.length} 个节点`);
    },
    [canvas.id, setRfNodes, onEdit, onRunComfy, onNodeResizeStable, showToast],
  );

  const duplicateSelected = useCallback(() => {
    void duplicateNodes(rfNodes.filter((n) => n.selected));
  }, [rfNodes, duplicateNodes]);

  /** 置顶（把 zIndex 抬到最高） */
  const bringToFront = useCallback(
    async (id: string) => {
      const maxZ = rfNodes.reduce((m, n) => Math.max(m, n.zIndex ?? 0), 0) + 1;
      setRfNodes((prev) =>
        prev.map((n) =>
          n.id === id
            ? { ...n, zIndex: maxZ, style: { ...n.style, zIndex: maxZ } }
            : n,
        ),
      );
      await updateCanvasNode(id, { zIndex: maxZ });
    },
    [rfNodes, setRfNodes],
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const editing =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable;

      const mod = e.metaKey || e.ctrlKey;

      // Ctrl+0：适应画布（编辑态也允许）
      if (mod && e.key === '0') {
        e.preventDefault();
        fitView({ padding: 0.18, duration: 320 });
        return;
      }

      if (editing) return;

      if (mod && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        void duplicateSelected();
        return;
      }

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
  }, [deleteSelected, duplicateSelected, fitView]);

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
      <div ref={wrapperRef} className="relative min-h-0 flex-1">
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
          onNodeContextMenu={(e, node) => {
            e.preventDefault();
            setContextMenu({ x: e.clientX, y: e.clientY, nodeId: node.id });
          }}
          onPaneContextMenu={(e) => {
            e.preventDefault();
            setContextMenu({ x: e.clientX, y: e.clientY });
          }}
          onPaneClick={() => setContextMenu(null)}
          defaultViewport={canvas.viewState}
          minZoom={0.2}
          maxZoom={2.5}
          selectionOnDrag
          selectionMode={SelectionMode.Partial}
          panOnDrag={[1]}
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
          {showMinimap && (
            <MiniMap
              pannable
              zoomable
              position="bottom-left"
              style={{ width: 160, height: 110 }}
              maskColor="var(--canvas-selection)"
              nodeColor="var(--border-strong)"
              nodeStrokeColor="var(--text-muted)"
            />
          )}
          <Controls showInteractive={false} position="bottom-right" />
        </ReactFlow>

        {/* 空画布引导 */}
        {rfNodes.length === 0 && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="pointer-events-auto max-w-[380px] rounded-lg border border-line bg-app/90 px-6 py-6 text-center backdrop-blur-sm">
              <p className="text-[13px] font-medium text-ink">空白画布</p>
              <p className="mt-1 text-xs leading-5 text-ink-muted">
                从底部工具栏添加节点开始。提示词 → ComfyUI 任务 → 生成结果，
                全部摊在同一张画布上，拖拽即整理。
              </p>
              <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5">
                <button
                  type="button"
                  onClick={() => void addNode('prompt')}
                  className="inline-flex h-7 items-center gap-1 rounded-md bg-app-inverse px-2.5 text-xs text-ink-inverse transition-opacity hover:opacity-90"
                >
                  <Type className="h-3.5 w-3.5" />
                  提示词
                </button>
                <button
                  type="button"
                  onClick={() => void addNode('comfy_run')}
                  className="inline-flex h-7 items-center gap-1 rounded-md border border-line px-2.5 text-xs text-ink-secondary transition-colors hover:bg-app-hover hover:text-ink"
                >
                  <Terminal className="h-3.5 w-3.5" />
                  ComfyUI 任务
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 底部浮动工具栏（参考 Excalidraw / tldraw） */}
        <div className="pointer-events-none absolute inset-x-0 bottom-4 z-20 flex justify-center">
          <div className="pointer-events-auto flex items-center gap-0.5 rounded-lg border border-line bg-app/95 px-1 py-1 shadow-float backdrop-blur-sm">
            {ADD_MENU.map((m) => {
              const Icon = m.icon;
              return (
                <button
                  key={m.type}
                  type="button"
                  title={`添加${m.label}`}
                  aria-label={`添加${m.label}`}
                  onClick={() => void addNode(m.type)}
                  className="flex h-8 w-8 items-center justify-center rounded-md text-ink-secondary transition-colors hover:bg-app-hover hover:text-ink active:bg-app-active"
                >
                  <Icon className="h-4 w-4" strokeWidth={1.75} />
                </button>
              );
            })}

            <div className="mx-1 h-5 w-px bg-line" />

            <button
              type="button"
              title="适应画布（Ctrl+0）"
              aria-label="适应画布"
              onClick={() => fitView({ padding: 0.18, duration: 320 })}
              className="flex h-8 w-8 items-center justify-center rounded-md text-ink-secondary transition-colors hover:bg-app-hover hover:text-ink"
            >
              <Maximize2 className="h-4 w-4" strokeWidth={1.75} />
            </button>
            <button
              type="button"
              title="小地图"
              aria-label="小地图"
              onClick={() => setShowMinimap((v) => !v)}
              className={
                showMinimap
                  ? 'flex h-8 w-8 items-center justify-center rounded-md bg-app-active text-ink transition-colors'
                  : 'flex h-8 w-8 items-center justify-center rounded-md text-ink-secondary transition-colors hover:bg-app-hover hover:text-ink'
              }
            >
              <MapIcon className="h-4 w-4" strokeWidth={1.75} />
            </button>
          </div>
        </div>

        {/* Toast 反馈 */}
        {toast && (
          <div className="pointer-events-none absolute left-1/2 top-3 z-30 -translate-x-1/2 animate-slide-up">
            <div className="max-w-[420px] truncate rounded-md border border-line bg-app px-3 py-1.5 text-xs text-ink shadow-float">
              {toast}
            </div>
          </div>
        )}
      </div>

      {/* 底部状态条 */}
      <div className="flex h-7 shrink-0 items-center justify-between border-t border-line bg-app px-3 text-[10px] text-ink-muted">
        <span className="flex items-center gap-2">
          <span className="flex items-center gap-1">
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{
                backgroundColor: comfyConnected ? 'var(--success)' : 'var(--text-muted)',
              }}
            />
            ComfyUI {comfyConnected ? '已连接' : '未连接'}
          </span>
          <span className="text-line-strong">·</span>
          <span className="hidden sm:inline">
            框选 · 空格/中键平移 · 滚轮缩放 · Ctrl+D 复制 · Delete 删除
          </span>
        </span>

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

      {/* 右键菜单 */}
      {contextMenu && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setContextMenu(null)}
            onContextMenu={(e) => {
              e.preventDefault();
              setContextMenu(null);
            }}
          />
          <div
            className="fixed z-50 w-[176px] overflow-hidden rounded-md border border-line bg-app py-1 shadow-float animate-scale-in"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            {contextMenu.nodeId ? (
              <>
                <CtxItem
                  icon={<Pencil className="h-3.5 w-3.5" />}
                  label="编辑"
                  onClick={() => {
                    setEditingId(contextMenu.nodeId!);
                    setContextMenu(null);
                  }}
                />
                <CtxItem
                  icon={<Copy className="h-3.5 w-3.5" />}
                  label="复制"
                  onClick={() => {
                    const target = rfNodes.find((n) => n.id === contextMenu.nodeId);
                    if (target) void duplicateNodes([target]);
                    setContextMenu(null);
                  }}
                />
                <CtxItem
                  icon={<ArrowUpToLine className="h-3.5 w-3.5" />}
                  label="置顶"
                  onClick={() => {
                    void bringToFront(contextMenu.nodeId!);
                    setContextMenu(null);
                  }}
                />
                <div className="my-1 h-px bg-line" />
                <CtxItem
                  icon={<Trash2 className="h-3.5 w-3.5" />}
                  label="删除"
                  danger
                  onClick={() => {
                    void deleteNode(contextMenu.nodeId!);
                    setContextMenu(null);
                  }}
                />
              </>
            ) : (
              <>
                <CtxItem
                  icon={<Type className="h-3.5 w-3.5" />}
                  label="添加提示词"
                  onClick={() => {
                    void addNode('prompt');
                    setContextMenu(null);
                  }}
                />
                <CtxItem
                  icon={<StickyNote className="h-3.5 w-3.5" />}
                  label="添加便签"
                  onClick={() => {
                    void addNode('note');
                    setContextMenu(null);
                  }}
                />
                <CtxItem
                  icon={<Terminal className="h-3.5 w-3.5" />}
                  label="添加 ComfyUI 任务"
                  onClick={() => {
                    void addNode('comfy_run');
                    setContextMenu(null);
                  }}
                />
                <div className="my-1 h-px bg-line" />
                <CtxItem
                  icon={<Maximize2 className="h-3.5 w-3.5" />}
                  label="适应画布"
                  onClick={() => {
                    fitView({ padding: 0.18, duration: 320 });
                    setContextMenu(null);
                  }}
                />
              </>
            )}
          </div>
        </>
      )}

      <NodeEditorDialog
        node={editingNode}
        onClose={() => setEditingId(null)}
        onSaved={handleNodeSaved}
      />
    </div>
  );
}

/* -------------------------------- 右键项 -------------------------------- */

function CtxItem({
  icon,
  label,
  onClick,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs transition-colors',
        danger
          ? 'text-ink-secondary hover:bg-app-hover hover:text-[var(--error)]'
          : 'text-ink-secondary hover:bg-app-hover hover:text-ink',
      )}
    >
      <span className="text-ink-muted">{icon}</span>
      {label}
    </button>
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
