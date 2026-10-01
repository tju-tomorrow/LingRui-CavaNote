/**
 * 画布视图
 *
 * 本产品的核心命题：**同一份 KnowledgeNode，文档视图和画布视图共享**。
 * 节点来自 Y.Doc（collab/useKnowledge），位置存在 Y.Doc 的 layout map。
 *
 * 边界（ADR-0003）：Excalidraw 只是渲染器。元素的 customData 回指 Knowledge / Annotation，
 * 正文永远不在这里。
 *
 * 同步策略（ADR-0011 决策 2）：**增量 patch，禁止整体重建**。
 *   - 每轮只 diff 出新增/修改/删除的元素（packages/canvas/src/scene-diff.ts）
 *   - 用户画的东西是 **Annotation 一等公民**（PRD/知识模型.md §2.3）：
 *     场景 → Y.Doc（planAnnotationSync），Y.Doc → 场景（desired 派生）
 *   - 人在画布上的改动会写回 Knowledge 并标 provenance=human
 */
import { useEffect, useMemo, useRef, useState, type ComponentProps } from "react";
import {
  CaptureUpdateAction,
  Excalidraw,
  convertToExcalidrawElements,
} from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import {
  markHuman,
  removeAnnotation,
  upsertAnnotation,
  type Annotation,
  type KnowledgeNode,
} from "@lingrui/knowledge";
import {
  annotationToExcalidrawElement,
  diffScene,
  nodeIdOf,
  nodeToExcalidrawElement,
  planAnnotationSync,
  relationToArrow,
  type DiffableElement,
  type ElementSkeleton,
  type ExcalidrawLike,
} from "@lingrui/canvas";
import { useAnnotations, useKnowledgeLayout, useKnowledgeNodes } from "./collab/useKnowledge";
import { NODE_SIZE, type NodeLayout } from "./collab/seed";
import { setNodePosition } from "./collab/layout";
import { ydoc } from "./collab/doc";
import { registerCanvas, bumpCanvasVersion } from "./canvas/bridge";
import { setFocus } from "./state/focus";

type ExcalidrawProps = ComponentProps<typeof Excalidraw>;
type ExcalidrawAPI = NonNullable<Parameters<NonNullable<ExcalidrawProps["excalidrawAPI"]>>[0]>;
type SceneElement = ReturnType<ExcalidrawAPI["getSceneElements"]>[number];

/** 场景指纹：Knowledge 内容、布局或注释变了就重算期望元素 */
function fingerprint(nodes: KnowledgeNode[], layout: NodeLayout, annotations: Annotation[]): string {
  const nodePart = nodes
    .map((n) => {
      const at = layout[n.id];
      return [
        n.id,
        n.kind,
        n.title,
        at ? `${at.x},${at.y}` : "",
        n.relations.map((r) => `${r.to}~${r.kind}~${r.label ?? ""}`).join(","),
      ].join(":");
    })
    .sort()
    .join("|");

  const annotationPart = annotations
    .map((a) =>
      [
        a.id,
        a.type,
        `${Math.round(a.element.x)},${Math.round(a.element.y)}`,
        `${Math.round(a.element.width)}x${Math.round(a.element.height)}`,
        a.element.points?.length ?? 0,
        a.text ?? "",
      ].join(":"),
    )
    .join("|");

  return `${nodePart}##${annotationPart}`;
}

function rectOf(nodeId: string, layout: NodeLayout) {
  const at = layout[nodeId] ?? { x: 0, y: 0 };
  return { x: at.x, y: at.y, width: NODE_SIZE.width, height: NODE_SIZE.height };
}

function buildSkeletons(nodes: KnowledgeNode[], layout: NodeLayout): ElementSkeleton[] {
  const known = new Set(nodes.map((n) => n.id));
  const out: ElementSkeleton[] = [];

  for (const node of nodes) {
    out.push(nodeToExcalidrawElement(node, rectOf(node.id, layout)));
  }

  for (const node of nodes) {
    for (const rel of node.relations) {
      if (!known.has(rel.to)) continue;
      out.push(
        relationToArrow(
          { elementId: `el-${node.id}`, rect: rectOf(node.id, layout) },
          { elementId: `el-${rel.to}`, rect: rectOf(rel.to, layout) },
          rel.label,
        ),
      );
    }
  }

  return out;
}

const INITIAL_DATA = {
  elements: [],
  appState: { viewBackgroundColor: "transparent" },
};

export function CanvasStage() {
  const nodes = useKnowledgeNodes();
  const layout = useKnowledgeLayout();
  const annotations = useAnnotations();

  const [api, setApi] = useState<ExcalidrawAPI | null>(null);
  const fittedRef = useRef(false);
  const draggingRef = useRef(false);
  const prevCountRef = useRef(0);
  /** 曾在场景里出现过的注释 id —— 避免误删刚写入 Y.Doc 的注释 */
  const seenAnnotationsRef = useRef(new Set<string>());

  const desired = useMemo(() => {
    if (nodes.length === 0 && annotations.length === 0) return null;

    const skeletons: ElementSkeleton[] = [
      ...buildSkeletons(nodes, layout),
      ...annotations.map(annotationToExcalidrawElement),
    ];

    const raw = convertToExcalidrawElements(
      skeletons as unknown as Parameters<typeof convertToExcalidrawElements>[0],
      // 关键：默认会 regenerateIds，把我们算好的稳定 id 全换成随机值，
      // 增量 diff 就再也认不出"同一个元素"了（ADR-0011 要求元素可寻址）。
      { regenerateIds: false },
    );

    // convertToExcalidrawElements 生成的标签文本元素不继承 skeleton 上的 customData，
    // 不把它们标成自己的就会被当成"用户手绘"并逐轮累积。
    return raw.map((el) => ({
      ...el,
      customData: { ...(el.customData as object | undefined), lingrui: true },
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fingerprint(nodes, layout, annotations)]);

  useEffect(() => {
    if (!api || !desired) return;

    const current = api.getSceneElements();
    // Excalidraw 的元素联合类型与 DiffableElement 结构一致，只是字段可选性不同
    const { elements } = diffScene(
      current as unknown as DiffableElement[],
      desired as unknown as DiffableElement[],
    );

    api.updateScene({
      elements: elements as unknown as SceneElement[],
      // Excalidraw 0.18 的 Store：不显式声明 captureUpdate 时改动会被下次 commit 覆盖
      // （表现为"数据在、画面空"）。见 ADR-0009。
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });

    if (!fittedRef.current) {
      fittedRef.current = true;
      requestAnimationFrame(() => {
        api.scrollToContent(undefined, { fitToContent: true, animate: false });
      });
    }
  }, [api, desired]);

  // 节点变多（通常是 AI 生成的）时重新对焦，否则新节点会落在视野外，
  // 用户以为"AI 什么也没做"。
  useEffect(() => {
    const grew = nodes.length > prevCountRef.current && prevCountRef.current > 0;
    prevCountRef.current = nodes.length;
    if (!grew || !api) return;
    requestAnimationFrame(() => {
      api.scrollToContent(undefined, { fitToContent: true, animate: true });
    });
  }, [nodes.length, api]);

  return (
    <div className="excalidraw-host">
      <Excalidraw
        initialData={INITIAL_DATA}
        excalidrawAPI={(nextApi) => {
          setApi(nextApi);
          // 聊天面板靠它截屏回灌上下文（ADR-0011 决策 4）
          registerCanvas(nextApi);
          if (import.meta.env.DEV) {
            // 开发期调试通道：__canvasApi.getSceneElements() 可直接查场景
            (window as unknown as Record<string, unknown>)["__canvasApi"] = nextApi;
          }
        }}
        onChange={(elements, appState) => {
          // ghost 预览靠它跟随视口
          bumpCanvasVersion();

          // ---- 场景 → Y.Doc：用户画的东西落成 Annotation ----
          // 靠 sameAnnotation 做幂等，天然不会自激循环
          const plan = planAnnotationSync(
            elements as unknown as ExcalidrawLike[],
            annotations,
            seenAnnotationsRef.current,
          );
          for (const annotation of plan.upserts) upsertAnnotation(ydoc, annotation);
          for (const id of plan.removals) removeAnnotation(ydoc, id);

          // ---- 拖动结束：位置写回 layout，并标记为人改过 ----
          const dragging = appState.selectedElementsAreBeingDragged;
          if (draggingRef.current && !dragging) {
            for (const el of elements) {
              const nodeId = nodeIdOf(el);
              if (!nodeId) continue;
              setNodePosition(nodeId, el.x, el.y);
              markHuman(ydoc, nodeId);
            }
          }
          draggingRef.current = dragging;

          const picked = Object.entries(appState.selectedElementIds ?? {}).find(([, v]) => v);
          if (!picked) return;
          const selected = elements.find((e) => e.id === picked[0]);
          const focused = selected ? nodeIdOf(selected) : undefined;
          if (focused) setFocus(focused);
        }}
      />
    </div>
  );
}
