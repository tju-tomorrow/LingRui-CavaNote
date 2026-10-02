/**
 * 画布视图（maxGraph 引擎，ADR-0013）
 *
 * 本产品的核心命题：**同一份 KnowledgeNode，文档视图和画布视图共享**。
 * 节点来自 Y.Doc（collab/useKnowledge），位置存在 Y.Doc 的 layout map。
 *
 * 边界：maxGraph 只是渲染器。cell id 就是 Knowledge/Annotation id，正文永远不在这里。
 *
 * 同步策略（ADR-0011 决策 2）：**增量 patch，禁止整体重建**。
 *   - 每轮按 id 把 GraphSpec upsert 进 maxGraph（packages/canvas/graph-engine.ts）
 *   - 拖动结束把位置写回 layout，并标 provenance=human
 *   - 注释 / 手动建节点 / 手动连线 / 对齐 / 自动布局 全部走同一条 Y.Doc 链路
 */
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useReadOnlyShare } from "../shell/share";
import {
  GraphEngine,
  buildGraphSpec,
  defaultAnnotation,
  ensureLibrariesForShapes,
  ensureStencilManifest,
  type GraphSpec,
} from "@lingrui/canvas";
import {
  addNodesToCanvas,
  getLayout,
  markHuman,
  readCanvas,
  readNode,
  removeAnnotation,
  setCanvasNodePosition,
  upsertAnnotation,
  upsertNode,
  type Annotation,
  type AnnotationType,
  type NodeKind,
} from "@lingrui/knowledge";
import {
  useAnnotations,
  useCanvasMeta,
  useKnowledgeLayout,
  useKnowledgeNodes,
} from "../collab/useKnowledge";
import { setNodePosition } from "../collab/layout";
import { ydoc } from "../collab/doc";
import { registerCanvas, bumpCanvasVersion } from "./bridge";
import { setFocus } from "../state/focus";
import { useActiveCanvas } from "../state/canvas";
import { AnnotationToolbar, type AnnotationTool } from "./AnnotationToolbar";
import { NodePalette } from "./NodePalette";

let seq = 0;
function newId(prefix: string): string {
  seq += 1;
  return `${prefix}-${Date.now().toString(36)}-${seq}`;
}

const POINT_TOOLS: AnnotationTool[] = ["sticky", "text", "highlight", "shape"];
const STROKE_TOOLS: AnnotationTool[] = ["draw", "arrow"];

const KIND_TITLE: Record<NodeKind, string> = {
  client: "调用方",
  gateway: "网关",
  service: "后端服务",
  cache: "缓存",
  database: "数据库",
  queue: "消息队列",
  registry: "注册中心",
  monitor: "监控",
  concept: "概念",
  note: "笔记",
};

interface ComposerState {
  type: "sticky" | "text";
  x: number;
  y: number;
  width: number;
  height: number;
  left: number;
  top: number;
  attachedTo?: string;
}

export function MxStage() {
  const allNodes = useKnowledgeNodes();
  const globalLayout = useKnowledgeLayout();
  const readOnly = useReadOnlyShare();

  // 概念画布：有 active canvas 就只画它的节点/布局/注释；否则回落全局那张图
  const activeCanvasId = useActiveCanvas();
  const activeCanvas = useCanvasMeta(activeCanvasId);
  const activeCanvasIdRef = useRef<string | null>(activeCanvasId);
  activeCanvasIdRef.current = activeCanvasId;
  const annotations = useAnnotations(activeCanvasId);
  const nodes = useMemo(
    () =>
      activeCanvas
        ? allNodes.filter((n) => activeCanvas.nodeIds.includes(n.id))
        : allNodes,
    [allNodes, activeCanvas],
  );
  const layout = useMemo(
    () => (activeCanvas ? { ...globalLayout, ...activeCanvas.layout } : globalLayout),
    [globalLayout, activeCanvas],
  );

  const hostRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<GraphEngine | null>(null);
  const [ready, setReady] = useState(0);
  const fittedRef = useRef(false);
  const prevCountRef = useRef(0);

  const [stencilVersion, setStencilVersion] = useState(0);
  const [tool, setTool] = useState<AnnotationTool>("select");
  const [panActive, setPanActive] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [nodeDraft, setNodeDraft] = useState<{ kind: NodeKind; shape?: string }>({
    kind: "service",
  });
  const [composer, setComposer] = useState<ComposerState | null>(null);
  const [draft, setDraft] = useState<Array<[number, number]> | null>(null);
  const drawingRef = useRef(false);
  const connectFromRef = useRef<string | null>(null);

  // draw.io stencil 库：清单 + 「现有节点用到的库」懒加载；加载后重新渲染
  useEffect(() => {
    let mounted = true;
    void ensureStencilManifest().then(() => {
      if (mounted) setStencilVersion((v) => v + 1);
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const keys = nodes
      .map((n) => (typeof n.meta?.["shape"] === "string" ? (n.meta["shape"] as string) : ""))
      .filter(Boolean);
    if (keys.length === 0) return;
    void ensureLibrariesForShapes(keys).then((count) => {
      if (count > 0) setStencilVersion((v) => v + 1);
    });
  }, [nodes]);

  // 挂载引擎（StrictMode 下会 mount→unmount→mount，destroy 会清空容器）
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const engine = new GraphEngine(host, {
      onNodeMoved: (nodeId, x, y) => {
        if (readOnly) return;
        setNodePosition(nodeId, x, y);
        // 当前有概念画布时，位置也写进它自己的布局（同一节点在不同画布可摆不同地方）
        const canvasId = activeCanvasIdRef.current;
        if (canvasId) setCanvasNodePosition(ydoc, canvasId, nodeId, x, y);
        markHuman(ydoc, nodeId);
      },
      onSelectionChanged: (nodeIds) => {
        setSelected(nodeIds);
        if (nodeIds[0]) setFocus(nodeIds[0]);
      },
      onViewportChanged: () => bumpCanvasVersion(),
    });
    engine.setMovable(!readOnly);
    engineRef.current = engine;
    registerCanvas(engine);
    setReady((value) => value + 1);

    return () => {
      registerCanvas(null);
      engine.destroy();
      engineRef.current = null;
    };
  }, [readOnly]);

  const spec: GraphSpec = useMemo(
    () => buildGraphSpec(nodes, layout, annotations),
    [nodes, layout, annotations],
  );

  // 把期望图（节点 + 关系 + 注释）同步进引擎
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || ready === 0) return;

    engine.render(spec);

    if (!fittedRef.current && spec.vertices.length > 0) {
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          if (engineRef.current === engine && engine.fitToContent()) {
            fittedRef.current = true;
          }
        }),
      );
    }
    // stencilVersion：形状库（懒）加载完要重渲染一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, spec, stencilVersion]);

  // 容器尺寸稳定后补 fit
  useEffect(() => {
    if (typeof ResizeObserver === "undefined") return;
    const host = hostRef.current;
    if (!host) return;

    const ro = new ResizeObserver(() => {
      const engine = engineRef.current;
      if (!engine || fittedRef.current) return;
      const { width, height } = engine.viewport();
      if (width < 120 || height < 120) return;
      requestAnimationFrame(() => {
        if (engineRef.current === engine && engine.fitToContent()) fittedRef.current = true;
      });
    });
    ro.observe(host);
    return () => ro.disconnect();
  }, [ready]);

  // 节点变多（AI 生成 / 手动新建）时重新对焦
  useEffect(() => {
    const engine = engineRef.current;
    const grew = nodes.length > prevCountRef.current && prevCountRef.current > 0;
    prevCountRef.current = nodes.length;
    if (!grew || !engine) return;
    requestAnimationFrame(() => engine.fitToContent());
  }, [nodes.length]);

  // ---- 写 Y.Doc 的动作 ----

  const createAnnotation = (annotation: Annotation) =>
    upsertAnnotation(
      ydoc,
      activeCanvasId ? { ...annotation, canvasId: activeCanvasId } : annotation,
    );

  const spawnNode = (at: [number, number]) => {
    const id = newId(nodeDraft.kind);
    upsertNode(ydoc, {
      id,
      kind: nodeDraft.kind,
      title: KIND_TITLE[nodeDraft.kind],
      relations: [],
      ...(nodeDraft.shape ? { meta: { shape: nodeDraft.shape } } : {}),
      provenance: { origin: "human", dirty: true, at: Date.now() },
    });
    setNodePosition(id, at[0], at[1]);
    const canvasId = activeCanvasIdRef.current;
    if (canvasId) addNodesToCanvas(ydoc, canvasId, [id], { [id]: { x: at[0], y: at[1] } });
    setFocus(id);
  };

  const createRelation = (from: string, to: string) => {
    if (from === to) return;
    const node = readNode(ydoc, from);
    if (!node) return;
    const id = `r-${from}-${to}-calls`;
    if (node.relations.some((r) => r.id === id)) return;
    upsertNode(ydoc, {
      ...node,
      relations: [...node.relations, { id, to, kind: "calls", label: "调用" }],
    });
  };

  const updateSelectedNode = (patch: { kind?: NodeKind; shape?: string | undefined }) => {
    if (selected.length !== 1) return;
    const id = selected[0]!;
    const node = readNode(ydoc, id);
    if (!node) return;
    const meta = { ...(node.meta ?? {}) };
    if (patch.shape === undefined) delete meta["shape"];
    else meta["shape"] = patch.shape;
    upsertNode(ydoc, {
      ...node,
      ...(patch.kind ? { kind: patch.kind } : {}),
      meta,
      provenance: { origin: "human", dirty: true, at: Date.now() },
    });
  };

  // ---- 对齐 / 分布 / 自动布局（作用域 = 当前选中） ----

  const selectedRects = () => {
    const engine = engineRef.current;
    if (!engine) return [];
    const ids = new Set(engine.selectedNodeIds());
    return engine
      .elements()
      .filter((el) => !el.isEdge && !el.isAnnotation && ids.has(el.id))
      .map((el) => ({ id: el.id, x: el.x, y: el.y, width: el.width, height: el.height }));
  };

  const align = (mode: "left" | "center" | "right") => {
    const rects = selectedRects();
    if (rects.length < 2) return;
    const minX = Math.min(...rects.map((r) => r.x));
    const maxX = Math.max(...rects.map((r) => r.x + r.width));
    const avgCenter = rects.reduce((sum, r) => sum + r.x + r.width / 2, 0) / rects.length;
    for (const rect of rects) {
      const x = mode === "left" ? minX : mode === "right" ? maxX - rect.width : avgCenter - rect.width / 2;
      setNodePosition(rect.id, Math.round(x), rect.y);
    }
  };

  const distributeH = () => {
    const rects = selectedRects().sort((a, b) => a.x - b.x);
    if (rects.length < 3) return;
    const first = rects[0]!;
    const last = rects[rects.length - 1]!;
    const total = last.x + last.width - first.x;
    const used = rects.reduce((sum, r) => sum + r.width, 0);
    const gap = (total - used) / (rects.length - 1);
    let cursor = first.x;
    for (const rect of rects) {
      setNodePosition(rect.id, Math.round(cursor), rect.y);
      cursor += rect.width + gap;
    }
  };

  // ---- 资产拖入（ADR-0014）：节点=引用，画布=合并 ----

  const handleCanvasDragOver = (event: ReactDragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  };

  const handleCanvasDrop = (event: ReactDragEvent<HTMLDivElement>) => {
    const engine = engineRef.current;
    if (!engine || readOnly) return;
    event.preventDefault();

    const nodeId = event.dataTransfer.getData("application/x-lingrui-node");
    const canvasId = event.dataTransfer.getData("application/x-lingrui-canvas");
    if (!nodeId && !canvasId) return;

    const pt = engine.containerToScene(event.clientX, event.clientY);
    const target = activeCanvasIdRef.current;

    // 节点资产：引用到当前画布（或全局图），落点即位置。
    // 按住 ⇧ 拖入 = 连它的直接邻居一起进来（关系子图，≤8，ADR-0014 §4.2）
    if (nodeId) {
      const ids = [nodeId];
      if (event.shiftKey) {
        const node = readNode(ydoc, nodeId);
        for (const relation of node?.relations ?? []) {
          if (ids.length >= 8) break;
          if (!ids.includes(relation.to) && readNode(ydoc, relation.to)) ids.push(relation.to);
        }
      }
      ids.forEach((id, idx) => {
        const x = Math.round(pt.x + (idx % 4) * 40);
        const y = Math.round(pt.y + Math.floor(idx / 4) * 40);
        if (target) {
          addNodesToCanvas(ydoc, target, [id], { [id]: { x, y } });
          setCanvasNodePosition(ydoc, target, id, x, y);
        }
        setNodePosition(id, x, y);
        markHuman(ydoc, id);
      });
      setFocus(nodeId);
      return;
    }

    // 画布资产：把源画布的 nodeIds + layout 合并到当前画布（缺帧位置就近排开）
    const source = readCanvas(ydoc, canvasId);
    if (!source) return;
    const fallback = getLayout(ydoc);
    let i = 0;
    for (const id of source.nodeIds) {
      const p = source.layout[id] ?? fallback.get(id);
      const x = Math.round(p?.x ?? pt.x + i * 40);
      const y = Math.round(p?.y ?? pt.y + Math.floor(i / 5) * 40);
      if (target) {
        addNodesToCanvas(ydoc, target, [id], { [id]: { x, y } });
        setCanvasNodePosition(ydoc, target, id, x, y);
      }
      setNodePosition(id, x, y);
      markHuman(ydoc, id);
      i += 1;
    }
  };

  const autoLayout = () => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.autoLayout();
    for (const el of engine.elements()) {
      if (el.isEdge || el.isAnnotation) continue;
      const nodeId = el.customData?.nodeId ?? el.id;
      setNodePosition(nodeId, Math.round(el.x), Math.round(el.y));
    }
    requestAnimationFrame(() => engine.fitToContent());
  };

  // ---- 画布指针交互（透明 capture 层） ----

  const onCaptureDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const engine = engineRef.current;
    if (!engine) return;

    // 抓手：按下即开始平移，后续 move/up 都走引擎平移链路
    if (tool === "pan") {
      engine.beginPan(event.clientX, event.clientY);
      setPanActive(true);
      (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
      return;
    }

    const scene = engine.containerToScene(event.clientX, event.clientY);
    const attachedTo = engine.nodeAt(scene.x, scene.y);

    if (tool === "node") {
      spawnNode([Math.round(scene.x), Math.round(scene.y)]);
      return;
    }

    if (tool === "connect") {
      connectFromRef.current = attachedTo ?? null;
      (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
      return;
    }

    if (POINT_TOOLS.includes(tool)) {
      const type = tool as AnnotationType;
      if (type === "sticky" || type === "text") {
        const tmpl = defaultAnnotation(type, [scene.x, scene.y], { id: "", attachedTo });
        const size = tmpl.element;
        const tl = engine.sceneToContainer(size.x, size.y);
        setComposer({
          type,
          x: size.x,
          y: size.y,
          width: size.width,
          height: size.height,
          left: tl.x,
          top: tl.y,
          ...(attachedTo ? { attachedTo } : {}),
        });
      } else {
        createAnnotation(
          defaultAnnotation(type, [scene.x, scene.y], {
            id: newId("anno"),
            ...(attachedTo ? { attachedTo } : {}),
          }),
        );
        setTool("select");
      }
      return;
    }

    if (STROKE_TOOLS.includes(tool)) {
      drawingRef.current = true;
      (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
      setDraft([[event.clientX, event.clientY]]);
    }
  };

  const onCaptureMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (tool === "pan") {
      engineRef.current?.panTo(event.clientX, event.clientY);
      return;
    }
    if (!drawingRef.current) return;
    setDraft((prev) => (prev ? [...prev, [event.clientX, event.clientY]] : prev));
  };

  const onCaptureUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const engine = engineRef.current;
    if (!engine) return;

    if (tool === "pan") {
      engine.endPan();
      setPanActive(false);
      return;
    }

    if (tool === "connect") {
      const from = connectFromRef.current;
      connectFromRef.current = null;
      if (!from) return;
      const scene = engine.containerToScene(event.clientX, event.clientY);
      const to = engine.nodeAt(scene.x, scene.y);
      if (to) createRelation(from, to);
      setTool("select");
      return;
    }

    if (!drawingRef.current) return;
    drawingRef.current = false;
    const points = draft;
    setDraft(null);
    setTool("select");
    if (!points || points.length < 2) return;

    const scenePts = points.map(([cx, cy]) => {
      const s = engine.containerToScene(cx, cy);
      return [s.x, s.y] as [number, number];
    });
    const xs = scenePts.map((p) => p[0]);
    const ys = scenePts.map((p) => p[1]);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const width = Math.max(1, Math.max(...xs) - minX);
    const height = Math.max(1, Math.max(...ys) - minY);
    const type: AnnotationType = tool === "arrow" ? "arrow" : "draw";

    createAnnotation({
      id: newId("anno"),
      type,
      element: {
        type,
        x: minX,
        y: minY,
        width,
        height,
        points: scenePts.map(([px, py]) => [px - minX, py - minY] as [number, number]),
      },
      provenance: { origin: "human", dirty: true, at: Date.now() },
    });
  };

  const commitComposer = (text: string) => {
    const pending = composer;
    setComposer(null);
    if (!pending) return;
    const trimmed = text.trim();
    if (!trimmed) return;
    createAnnotation({
      id: newId("anno"),
      type: pending.type,
      ...(pending.attachedTo ? { attachedTo: pending.attachedTo } : {}),
      element: {
        type: pending.type,
        x: pending.x,
        y: pending.y,
        width: pending.width,
        height: pending.height,
      },
      text: trimmed,
      provenance: { origin: "human", dirty: true, at: Date.now() },
    });
  };

  const clearAnnotations = () => {
    for (const annotation of annotations) removeAnnotation(ydoc, annotation.id);
  };

  const drawing = STROKE_TOOLS.includes(tool);
  const paletteOpen = !readOnly && (tool === "node" || (tool === "select" && selected.length === 1));
  const editingNode = tool !== "node" && selected.length === 1 ? readNode(ydoc, selected[0]!) : undefined;

  return (
    <>
      {!readOnly ? <AnnotationToolbar tool={tool} onTool={setTool} /> : null}

      {/* 布局动作：选中 ≥2 可用对齐/分布，≥1 可用自动布局 */}
      {!readOnly ? (
        <div className="layout-bar" role="toolbar" aria-label="布局">
          <button type="button" disabled={selected.length < 2} title="左对齐" onClick={() => align("left")}>
            ⇤
          </button>
          <button type="button" disabled={selected.length < 2} title="水平居中" onClick={() => align("center")}>
            ↔
          </button>
          <button type="button" disabled={selected.length < 2} title="右对齐" onClick={() => align("right")}>
            ⇥
          </button>
          <button type="button" disabled={selected.length < 3} title="水平等距分布" onClick={distributeH}>
            ⇹
          </button>
          <button type="button" disabled={nodes.length < 2} title="自动布局（层级）" onClick={autoLayout}>
            ⊞
          </button>
        </div>
      ) : null}

      <div
        className="mxgraph-host"
        ref={hostRef}
        onDragOver={handleCanvasDragOver}
        onDrop={handleCanvasDrop}
      />

      {paletteOpen ? (
        <NodePalette
          kind={editingNode?.kind ?? nodeDraft.kind}
          shape={editingNode ? (editingNode.meta?.["shape"] as string | undefined) : nodeDraft.shape}
          editing={Boolean(editingNode)}
          onKind={(kind) => {
            if (editingNode) updateSelectedNode({ kind });
            else setNodeDraft((d) => ({ ...d, kind }));
          }}
          onShape={(shape) => {
            if (editingNode) updateSelectedNode({ shape });
            else setNodeDraft((d) => ({ ...d, shape }));
          }}
          onClose={() => setTool("select")}
        />
      ) : null}

      {!readOnly && tool !== "select" ? (
        <div
          className={`anno-capture${tool === "pan" ? " is-pan" : ""}${panActive ? " is-panning" : ""}`}
          onPointerDown={onCaptureDown}
          onPointerMove={onCaptureMove}
          onPointerUp={onCaptureUp}
          onPointerCancel={onCaptureUp}
        />
      ) : null}

      {draft && draft.length > 1 ? (
        <svg className="anno-draft" aria-hidden="true">
          <polyline
            points={draft.map(([x, y]) => `${x},${y}`).join(" ")}
            fill="none"
            stroke={tool === "arrow" ? "#1971c2" : "#1e1e1e"}
            strokeWidth={2}
          />
        </svg>
      ) : null}

      {composer ? (
        <textarea
          className="anno-composer"
          autoFocus
          placeholder={composer.type === "sticky" ? "写点什么…" : "输入文本…"}
          style={{ left: composer.left, top: composer.top, width: composer.width, height: composer.height }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              commitComposer((e.target as HTMLTextAreaElement).value);
            } else if (e.key === "Escape") {
              e.preventDefault();
              setComposer(null);
            }
          }}
          onBlur={(e) => commitComposer(e.target.value)}
        />
      ) : null}

      {!readOnly && annotations.length > 0 && tool === "select" ? (
        <button type="button" className="anno-clear" onClick={clearAnnotations} title="清除所有注释">
          清除注释（{annotations.length}）
        </button>
      ) : null}
    </>
  );
}
