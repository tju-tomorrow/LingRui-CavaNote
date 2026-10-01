/**
 * 画布视图
 *
 * 本产品的核心命题：**同一份 KnowledgeNode，文档视图和画布视图共享**。
 * 节点来自 Y.Doc（collab/useKnowledge），位置存在 Y.Doc 的 layout map。
 *
 * 边界（ADR-0003）：Excalidraw 只是渲染器。元素的 customData.nodeId 回指 Knowledge，
 * 正文永远不在这里。
 *
 * 同步策略（ADR-0011 决策 2）：**增量 patch，禁止整体重建**。
 *   - 每轮只 diff 出新增/修改/删除的元素，最小化改动（packages/canvas/src/scene-diff.ts）
 *   - 用户手绘原样保留
 *   - 人在画布上的改动会写回 Knowledge 并标 provenance=human
 */
import { useEffect, useMemo, useRef, useState, type ComponentProps } from "react";
import {
  CaptureUpdateAction,
  Excalidraw,
  convertToExcalidrawElements,
} from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import type { KnowledgeNode } from "@lingrui/knowledge";
import {
  diffScene,
  nodeIdOf,
  nodeToExcalidrawElement,
  relationToArrow,
  type DiffableElement,
  type ElementSkeleton,
} from "@lingrui/canvas";
import { markHuman } from "@lingrui/knowledge";
import { useKnowledgeNodes, useKnowledgeLayout } from "./collab/useKnowledge";
import { NODE_SIZE, type NodeLayout } from "./collab/seed";
import { setNodePosition } from "./collab/layout";
import { ydoc } from "./collab/doc";
import { setFocus } from "./state/focus";

type ExcalidrawProps = ComponentProps<typeof Excalidraw>;
type ExcalidrawAPI = NonNullable<Parameters<NonNullable<ExcalidrawProps["excalidrawAPI"]>>[0]>;
type SceneElement = ReturnType<ExcalidrawAPI["getSceneElements"]>[number];

/** 场景指纹：Knowledge 内容或布局变了就重算期望元素 */
function fingerprint(nodes: KnowledgeNode[], layout: NodeLayout): string {
  return nodes
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

  const [api, setApi] = useState<ExcalidrawAPI | null>(null);
  const fittedRef = useRef(false);
  const draggingRef = useRef(false);

  const desired = useMemo(() => {
    if (nodes.length === 0) return null;
    const raw = convertToExcalidrawElements(
      buildSkeletons(nodes, layout) as unknown as Parameters<typeof convertToExcalidrawElements>[0],
      // 关键：默认会 regenerateIds，把我们算好的稳定 id（el-<nodeId> / edge-…）全换成随机值，
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
  }, [fingerprint(nodes, layout)]);

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

    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>)["__canvasSync"] = {
        apiId: api.id,
        desired: desired.length,
        before: current.length,
        sent: elements.length,
        sceneAfter: api.getSceneElements().length,
      };
    }

    if (!fittedRef.current) {
      fittedRef.current = true;
      requestAnimationFrame(() => {
        api.scrollToContent(undefined, { fitToContent: true, animate: false });
      });
    }
  }, [api, desired]);

  return (
    <div className="excalidraw-host">
      <Excalidraw
        initialData={INITIAL_DATA}
        excalidrawAPI={(nextApi) => {
          setApi(nextApi);
          if (import.meta.env.DEV) {
            // 开发期调试通道：__canvasApi.getSceneElements() 可直接查场景
            (window as unknown as Record<string, unknown>)["__canvasApi"] = nextApi;
          }
        }}
        onChange={(elements, appState) => {
          // 拖动结束：位置写回 layout，并把节点标记为人改过（ADR-0011 provenance）
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
