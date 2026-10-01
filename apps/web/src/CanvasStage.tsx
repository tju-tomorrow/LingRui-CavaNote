/**
 * 画布视图
 *
 * 演示本产品的核心命题：**同一份 KnowledgeNode，文档视图和画布视图共享**。
 * 节点来自 Y.Doc（collab/useKnowledge），位置属于"表现"（存在 Y.Doc 的 layout map 里）。
 *
 * 边界（ADR-0003）：Excalidraw 只是渲染器。元素的 customData.nodeId 回指 Knowledge，
 * 正文永远不在这里。
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
  isLingRuiElement,
  nodeIdOf,
  nodeToExcalidrawElement,
  relationToArrow,
  type ElementSkeleton,
} from "@lingrui/canvas";
import { useKnowledgeNodes, useKnowledgeLayout } from "./collab/useKnowledge";
import { NODE_SIZE, type NodeLayout } from "./collab/seed";
import { setNodePosition } from "./collab/layout";
import { setFocus } from "./state/focus";

type ExcalidrawProps = ComponentProps<typeof Excalidraw>;
type ExcalidrawAPI = NonNullable<Parameters<NonNullable<ExcalidrawProps["excalidrawAPI"]>>[0]>;
type SceneElement = ReturnType<ExcalidrawAPI["getSceneElements"]>[number];

/** 场景指纹：Knowledge 内容或布局变了就要重画 */
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
      // 目标节点还不在画布上就跳过，等它出现再画线
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

  // 用 state 而不是 ref：StrictMode 下 excalidrawAPI 回调可能晚于 effect 执行，
  // 用 ref 会拿到已卸载的旧实例，updateScene 打到一个看不见的 scene 上。
  const [api, setApi] = useState<ExcalidrawAPI | null>(null);
  const fittedRef = useRef(false);
  const draggingRef = useRef(false);

  const converted = useMemo(() => {
    if (nodes.length === 0) return null;
    const raw = convertToExcalidrawElements(
      buildSkeletons(nodes, layout) as unknown as Parameters<typeof convertToExcalidrawElements>[0],
    );
    // 关键：convertToExcalidrawElements 会额外生成标签文本元素，它们**不会**继承
    // 我们写在 skeleton 上的 customData。不把它们也标成自己的，就会被当成
    // "用户手绘"，每次重建都累积一层。
    return raw.map((el) => ({
      ...el,
      customData: { ...(el.customData as object | undefined), lingrui: true },
    }));
    // 故意用指纹而不是 nodes/layout 对象：避免同内容不同引用导致重画
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fingerprint(nodes, layout)]);

  useEffect(() => {
    if (!api || !converted) return;

    // 只替换"我们自己的"元素，用户手绘的内容原样保留
    const foreign = api
      .getSceneElements()
      .filter((el: SceneElement) => !isLingRuiElement(el));

    api.updateScene({
      elements: [...converted, ...foreign],
      // Excalidraw 0.18 引入了 Store：不显式声明 captureUpdate 时，
      // 场景改动会被下次 commit 覆盖回去（表现为"数据在、画面空"）。见 ADR-0009。
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });

    if (!fittedRef.current) {
      fittedRef.current = true;
      requestAnimationFrame(() => {
        api.scrollToContent(undefined, { fitToContent: true, animate: false });
      });
    }
  }, [api, converted]);

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
          // 只在拖动结束时把位置写回 Knowledge 层，避免 onChange 与场景重建互相触发
          const dragging = appState.selectedElementsAreBeingDragged;
          if (draggingRef.current && !dragging) {
            for (const el of elements) {
              const nodeId = nodeIdOf(el);
              if (nodeId) setNodePosition(nodeId, el.x, el.y);
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
