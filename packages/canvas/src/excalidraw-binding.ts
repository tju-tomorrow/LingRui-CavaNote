/**
 * @lingrui/canvas — 画布层
 *
 * 职责边界（见 ADR-0003）：
 *   Excalidraw 只是**渲染器**。元素只存 `customData.nodeId` + 表现属性，正文永远在 Y.Doc。
 */
import type { KnowledgeNode } from "@lingrui/knowledge";

/** 画布元素上挂的私有数据 */
export interface LingRuiCustomData {
  nodeId: string;
  kind: string;
  [k: string]: unknown;
}

/** 每种基建实体的视觉配方（手绘风 + 语义色） */
export const NODE_STYLE: Record<string, { stroke: string; background: string; icon: string }> = {
  client: { stroke: "#1e1e1e", background: "#ffffff", icon: "user" },
  gateway: { stroke: "#5b5bd6", background: "#eef0ff", icon: "gateway" },
  service: { stroke: "#0f7b6c", background: "#e6f6f2", icon: "server" },
  cache: { stroke: "#c2410c", background: "#fff1e6", icon: "redis" },
  database: { stroke: "#1d4ed8", background: "#e8f0ff", icon: "database" },
  queue: { stroke: "#b45309", background: "#fff7e0", icon: "queue" },
  registry: { stroke: "#7c3aed", background: "#f4ecff", icon: "registry" },
  monitor: { stroke: "#334155", background: "#f1f5f9", icon: "monitor" },
  concept: { stroke: "#475569", background: "#f8fafc", icon: "bulb" },
  note: { stroke: "#475569", background: "#f8fafc", icon: "file" },
};

export interface SpawnOptions {
  x: number;
  y: number;
  width?: number;
  height?: number;
}

/**
 * KnowledgeNode → Excalidraw 元素。
 * 注意：这里只产生"表现"，身份通过 customData.nodeId 回指 Knowledge。
 */
export function nodeToExcalidrawElement(
  node: KnowledgeNode,
  opts: SpawnOptions,
): Record<string, unknown> {
  const style = NODE_STYLE[node.kind] ?? NODE_STYLE.note!;
  const width = opts.width ?? 220;
  const height = opts.height ?? 96;
  return {
    type: "rectangle",
    id: node.canvas?.elementId ?? `el-${node.id}`,
    x: opts.x,
    y: opts.y,
    width,
    height,
    strokeColor: style.stroke,
    backgroundColor: style.background,
    fillStyle: "solid",
    strokeStyle: "solid",
    roughness: 1.4, // 手绘
    roundness: { type: 3 },
    label: {
      text: node.title,
      fontSize: 18,
      strokeColor: style.stroke,
    },
    customData: { nodeId: node.id, kind: node.kind } satisfies LingRuiCustomData,
  };
}

/** 从 Excalidraw 元素反查 nodeId */
export function nodeIdOf(element: { customData?: unknown }): string | undefined {
  const d = element.customData as LingRuiCustomData | undefined;
  return d?.nodeId;
}

/** 关系 → 箭头（Excalidraw 通过 startBinding / endBinding 绑定元素） */
export function relationToArrow(
  fromElementId: string,
  toElementId: string,
  label?: string,
): Record<string, unknown> {
  return {
    type: "arrow",
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    strokeColor: "#1971c2",
    strokeStyle: "solid",
    roughness: 1.2,
    start: { id: fromElementId },
    end: { id: toElementId },
    startBinding: { elementId: fromElementId, focus: 0, gap: 8 },
    endBinding: { elementId: toElementId, focus: 0, gap: 8 },
    label: label ? { text: label, fontSize: 14 } : undefined,
    customData: { kind: "relation" } satisfies Partial<LingRuiCustomData>,
  };
}
