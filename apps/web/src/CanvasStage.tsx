/**
 * 画布视图
 *
 * 演示本产品的核心命题：**同一份 KnowledgeNode，文档视图和画布视图共享**。
 * 节点来自 Y.Doc（collab/useKnowledge），位置属于"表现"（collab/seed 的 LAYOUT）。
 *
 * 边界（ADR-0003）：Excalidraw 只是渲染器。元素的 customData.nodeId 回指 Knowledge，
 * 正文永远不在这里。
 *
 * 同步策略（见 ADR-0009）：场景内容由节点集合派生，节点集合变化时**整体重建**。
 * 为什么不用 updateScene 增量同步：Excalidraw 的命令式 API 实例在 React 重渲染 /
 * HMR 下会被替换，增量写入容易打到一个已脱离渲染的 scene 上（表现为"数据在、画面空"）。
 */
import { useMemo } from "react";
import { Excalidraw, convertToExcalidrawElements } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import type { KnowledgeNode } from "@lingrui/knowledge";
import {
  nodeIdOf,
  nodeToExcalidrawElement,
  relationToArrow,
  type ElementSkeleton,
} from "@lingrui/canvas";
import { useKnowledgeNodes } from "./collab/useKnowledge";
import { LAYOUT, NODE_SIZE } from "./collab/seed";
import { setFocus } from "./state/focus";

function rectOf(nodeId: string): { x: number; y: number; width: number; height: number } {
  const at = LAYOUT[nodeId] ?? { x: 0, y: 0 };
  return { x: at.x, y: at.y, width: NODE_SIZE.width, height: NODE_SIZE.height };
}

function buildSkeletons(nodes: KnowledgeNode[]): ElementSkeleton[] {
  const known = new Set(nodes.map((n) => n.id));
  const out: ElementSkeleton[] = [];

  for (const node of nodes) {
    out.push(nodeToExcalidrawElement(node, { ...rectOf(node.id) }));
  }

  for (const node of nodes) {
    for (const rel of node.relations) {
      // 目标节点还不在画布上就跳过，等它出现再画线
      if (!known.has(rel.to)) continue;
      out.push(
        relationToArrow(
          { elementId: `el-${node.id}`, rect: rectOf(node.id) },
          { elementId: `el-${rel.to}`, rect: rectOf(rel.to) },
          rel.label,
        ),
      );
    }
  }

  return out;
}

export function CanvasStage() {
  const nodes = useKnowledgeNodes();

  // 节点集合 + 内容的指纹：Knowledge 变了就重建场景
  const sceneKey = nodes
    .map(
      (n) =>
        `${n.id}:${n.kind}:${n.title}:${n.relations
          .map((r) => `${r.to}~${r.kind}~${r.label ?? ""}`)
          .join(",")}`,
    )
    .sort()
    .join("|");

  const initialData = useMemo(() => {
    if (nodes.length === 0) return null;
    return {
      elements: convertToExcalidrawElements(
        buildSkeletons(nodes) as unknown as Parameters<typeof convertToExcalidrawElements>[0],
      ),
      appState: { viewBackgroundColor: "transparent" },
      scrollToContent: true,
    };
    // 故意只依赖 sceneKey：节点内容变化时重建，而不是增量 patch
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sceneKey]);

  if (!initialData) {
    return <div className="excalidraw-host" />;
  }

  return (
    <div className="excalidraw-host">
      <Excalidraw
        key={sceneKey}
        initialData={initialData}
        excalidrawAPI={(api) => {
          if (import.meta.env.DEV) {
            // 开发期调试通道：控制台里 __canvasApi.getSceneElements() 可直接查场景
            (window as unknown as Record<string, unknown>)["__canvasApi"] = api;
          }
          // initialData.scrollToContent 在容器尺寸刚就绪时算不准，挂载后手动对一次视野
          requestAnimationFrame(() => {
            api.scrollToContent(undefined, { fitToContent: true, animate: false });
          });
        }}
        onChange={(elements, appState) => {
          const picked = Object.entries(appState.selectedElementIds ?? {}).find(([, v]) => v);
          if (!picked) return;
          const el = elements.find((e) => e.id === picked[0]);
          const nodeId = el ? nodeIdOf(el) : undefined;
          if (nodeId) setFocus(nodeId);
        }}
      />
    </div>
  );
}
