/**
 * @lingrui/canvas — 画布层
 *
 * 职责边界（见 ADR-0003）：
 *   Excalidraw 只是**渲染器**。元素只存 `customData.nodeId` + 表现属性，正文永远在 Y.Doc。
 */
import type { KnowledgeNode } from "@lingrui/knowledge";

/** 画布元素上挂的私有数据 */
export interface LingRuiCustomData {
  lingrui?: true;
  nodeId?: string;
  kind?: string;
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

/**
 * 语义图标（PRD/主界面.md §2.6「画布节点带语义图标」）。
 *
 * Excalidraw 没有图标图元，所以走标签文本：单元素、diffScene 无额外负担、
 * 缩放不失真，也不用把图标做成图片资源。key 对应 NODE_STYLE 的 icon 字段。
 */
export const ICON_GLYPH: Record<string, string> = {
  user: "👤",
  gateway: "🚪",
  server: "🧩",
  redis: "⚡",
  database: "🗄️",
  queue: "📮",
  registry: "🧭",
  monitor: "📈",
  bulb: "💡",
  file: "📄",
};

/** Excalidraw skeleton：能被 convertToExcalidrawElements() 消费的松散结构 */
export interface ElementSkeleton {
  type: string;
  id?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  start?: { id: string };
  end?: { id: string };
  label?: { text: string; fontSize?: number };
  [k: string]: unknown;
}

export interface SpawnOptions {
  x: number;
  y: number;
  width?: number;
  height?: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 从矩形中心沿方向射线，求与矩形边界的交点 */
function borderPoint(rect: Rect, dx: number, dy: number): [number, number] {
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  const sx = dx === 0 ? Number.POSITIVE_INFINITY : rect.width / 2 / Math.abs(dx);
  const sy = dy === 0 ? Number.POSITIVE_INFINITY : rect.height / 2 / Math.abs(dy);
  const s = Math.min(sx, sy);
  return [cx + dx * s, cy + dy * s];
}

/**
 * KnowledgeNode → Excalidraw 元素 skeleton。
 * 注意：这里只产生"表现"，身份通过 customData.nodeId 回指 Knowledge。
 */
export function nodeToExcalidrawElement(
  node: KnowledgeNode,
  opts: SpawnOptions,
): ElementSkeleton {
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
      // 图标 + 标题：一眼能分出网关/缓存/队列，而不只是颜色差异
      text: `${ICON_GLYPH[style.icon] ?? "•"} ${node.title}`,
      fontSize: 18,
    },
    customData: { lingrui: true, nodeId: node.id, kind: node.kind } satisfies LingRuiCustomData,
  };
}

/** 从 Excalidraw 元素反查 nodeId */
export function nodeIdOf(element: { customData?: unknown }): string | undefined {
  const d = element.customData as LingRuiCustomData | undefined;
  return d?.nodeId;
}

/**
 * 关系 → 箭头 skeleton。
 *
 * 注意：Excalidraw 的 convertToExcalidrawElements **不会**根据 start/end 绑定自动布线，
 * 必须显式给 x/y/points，否则所有箭头会堆在原点、长度 100。
 * 这里按两个矩形的边界计算一条直线箭头，同时保留 start/end 以支持拖动时重新绑定。
 */
export function relationToArrow(
  from: { elementId: string; rect: Rect },
  to: { elementId: string; rect: Rect },
  label?: string,
): ElementSkeleton {
  const fromCenter: [number, number] = [
    from.rect.x + from.rect.width / 2,
    from.rect.y + from.rect.height / 2,
  ];
  const toCenter: [number, number] = [
    to.rect.x + to.rect.width / 2,
    to.rect.y + to.rect.height / 2,
  ];

  const dx = toCenter[0] - fromCenter[0];
  const dy = toCenter[1] - fromCenter[1];

  const start = borderPoint(from.rect, dx, dy);
  const end = borderPoint(to.rect, -dx, -dy);

  return {
    type: "arrow",
    id: `edge-${from.elementId}-${to.elementId}`,
    x: start[0],
    y: start[1],
    width: end[0] - start[0],
    height: end[1] - start[1],
    points: [
      [0, 0],
      [end[0] - start[0], end[1] - start[1]],
    ],
    strokeColor: "#1971c2",
    strokeStyle: "solid",
    roughness: 1.2,
    start: { id: from.elementId },
    end: { id: to.elementId },
    label: label ? { text: label, fontSize: 14 } : undefined,
    customData: { lingrui: true, kind: "relation" },
  };
}

/** 判断一个 Excalidraw 元素是不是本应用生成的（用于同步时区分用户手绘内容） */
export function isLingRuiElement(element: { customData?: unknown }): boolean {
  return Boolean((element.customData as { lingrui?: boolean } | undefined)?.lingrui);
}
