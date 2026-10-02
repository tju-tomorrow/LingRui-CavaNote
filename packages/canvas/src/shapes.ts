/**
 * 形状词汇表（ADR-0013）
 *
 * 这里是「知识节点的语义 kind → 真实图形」的唯一映射。引擎无关（纯数据），
 * 渲染器（maxGraph）只负责把它翻译成 cell style。
 *
 * 为什么单列一层：draw.io 的「表现力」本质是**把形状词汇表和领域模型解耦** ——
 * 领域模型只说"这是一个数据库"，形状层决定它长成圆柱、放在哪个端口、配什么图标。
 * 换引擎时只要重写这一层的适配，知识模型（@lingrui/knowledge）一行不动。
 */
import type { NodeKind, RelationKind } from "@lingrui/knowledge";

/** 我们真正用到的 maxGraph cell style 子集（避免把整个 CellStateStyle 拖进来） */
export interface CellStyle {
  shape?: string;
  fillColor?: string;
  strokeColor?: string;
  strokeWidth?: number;
  dashed?: boolean;
  rounded?: boolean;
  arcSize?: number;
  fontSize?: number;
  fontColor?: string;
  fontStyle?: number;
  align?: "left" | "center" | "right";
  verticalAlign?: "top" | "middle" | "bottom";
  whiteSpace?: "wrap" | "nowrap";
  overflow?: "fill" | "hidden" | "width";
  html?: boolean;
  spacingTop?: number;
  spacingLeft?: number;
  spacingRight?: number;
  /** 图标叠加（image 形状 / image 装饰） */
  image?: string;
  imageWidth?: number;
  imageHeight?: number;
  imageAlign?: "left" | "center" | "right";
  imageVerticalAlign?: "top" | "middle" | "bottom";
  imageAspect?: boolean;
  /** 布线 / 箭头 */
  edgeStyle?: string;
  endArrow?: string;
  startArrow?: string;
  endFill?: boolean;
  startFill?: boolean;
  elbow?: "horizontal" | "vertical";
  rounded_edge?: boolean;
  [key: string]: unknown;
}

/** 一套「语义形状」：图形 + 默认尺寸 + 配色 */
export interface NodeShape {
  /** 形状名（maxGraph ShapeRegistry / StencilShapeRegistry 的 key） */
  shape: string;
  /** 默认尺寸（表现层；AI 布局与 @lingrui/ai 的 DEFAULT_NODE_SIZE 保持一致） */
  size: { width: number; height: number };
  stroke: string;
  background: string;
  /** 语义图标 key（后续叠加 SVG） */
  icon: string;
  /** 标签放顶部还是中间（圆柱/人物不适合居中压图） */
  labelPosition: "center" | "bottom";
}

/**
 * 节点语义 → 形状。
 *
 * 形状全部是 maxGraph 内置的（无需额外资源）：
 *   actor 人物 · cylinder 圆柱 · cloud 云 · hexagon 六边形 · ellipse 椭圆 · rectangle 矩形
 */
export const NODE_SHAPE: Record<NodeKind, NodeShape> = {
  client: {
    shape: "actor",
    size: { width: 110, height: 150 },
    stroke: "#1e293b",
    background: "#ffffff",
    icon: "user",
    labelPosition: "bottom",
  },
  gateway: {
    shape: "hexagon",
    size: { width: 210, height: 110 },
    stroke: "#4338ca",
    background: "#eef2ff",
    icon: "gateway",
    labelPosition: "center",
  },
  service: {
    shape: "server",
    size: { width: 220, height: 120 },
    stroke: "#0f766e",
    background: "#ecfdf5",
    icon: "server",
    labelPosition: "center",
  },
  cache: {
    shape: "cylinder",
    size: { width: 180, height: 130 },
    stroke: "#c2410c",
    background: "#fff7ed",
    icon: "cache",
    labelPosition: "center",
  },
  database: {
    shape: "cylinder",
    size: { width: 180, height: 140 },
    stroke: "#1d4ed8",
    background: "#eff6ff",
    icon: "database",
    labelPosition: "center",
  },
  queue: {
    shape: "rectangle",
    size: { width: 210, height: 100 },
    stroke: "#b45309",
    background: "#fffbeb",
    icon: "queue",
    labelPosition: "center",
  },
  registry: {
    shape: "ellipse",
    size: { width: 190, height: 120 },
    stroke: "#7c3aed",
    background: "#f5f3ff",
    icon: "registry",
    labelPosition: "center",
  },
  monitor: {
    shape: "ellipse",
    size: { width: 190, height: 120 },
    stroke: "#334155",
    background: "#f1f5f9",
    icon: "monitor",
    labelPosition: "center",
  },
  concept: {
    shape: "cloud",
    size: { width: 220, height: 140 },
    stroke: "#475569",
    background: "#f8fafc",
    icon: "bulb",
    labelPosition: "center",
  },
  note: {
    shape: "rectangle",
    size: { width: 220, height: 100 },
    stroke: "#475569",
    background: "#f8fafc",
    icon: "file",
    labelPosition: "center",
  },
};

/** 语义图标 key（后续用 SVG 叠加；当前先保留，供 UI 侧使用） */
export const ICON_KEY = {
  user: "user",
  gateway: "gateway",
  server: "server",
  cache: "cache",
  database: "database",
  queue: "queue",
  registry: "registry",
  monitor: "monitor",
  bulb: "bulb",
  file: "file",
} as const;

/** 语义图标 key（供 UI 侧使用；画布内的真图形由 NODE_SHAPE 决定） */

/**
 * 关系语义 → 连线样式。
 *
 * draw.io 的「连线语义」：实线=同步调用、虚线=异步/依赖、箭头类型区分读/写/发布。
 * 正交布线由 edgeStyle 交给 maxGraph 自动算，这里只定语义。
 */
export interface RelationStyle {
  stroke: string;
  dashed: boolean;
  endArrow: string;
  startArrow: string;
}

export const RELATION_STYLE: Record<RelationKind, RelationStyle> = {
  calls: { stroke: "#1d4ed8", dashed: false, endArrow: "classic", startArrow: "none" },
  reads: { stroke: "#0e7490", dashed: false, endArrow: "open", startArrow: "none" },
  writes: { stroke: "#b91c1c", dashed: false, endArrow: "block", startArrow: "none" },
  publishes: { stroke: "#b45309", dashed: true, endArrow: "classic", startArrow: "none" },
  subscribes: { stroke: "#b45309", dashed: true, endArrow: "classic", startArrow: "classic" },
  references: { stroke: "#64748b", dashed: true, endArrow: "open", startArrow: "none" },
  "depends-on": { stroke: "#64748b", dashed: true, endArrow: "open", startArrow: "none" },
};

/**
 * 兼容旧调用点（KnowledgeView / NodeDetailCard）的配色接口。
 * 新代码请直接用 NODE_SHAPE。
 */
export const NODE_STYLE: Record<string, { stroke: string; background: string; icon: string }> =
  Object.fromEntries(
    Object.entries(NODE_SHAPE).map(([kind, shape]) => [
      kind,
      { stroke: shape.stroke, background: shape.background, icon: shape.icon },
    ]),
  );

/** 节点默认尺寸（按 kind 取；未知 kind 退回 note） */
export function nodeSize(kind: NodeKind): { width: number; height: number } {
  return (NODE_SHAPE[kind] ?? NODE_SHAPE.note).size;
}

/** 资产级形态预设（ADR-0014）：跨画布统一外观的可选覆盖 */
export interface NodeStyleOverride {
  fillColor?: string;
  strokeColor?: string;
  /** 画布尺寸（手工摆位后的记忆；不影响 AI 布局） */
  size?: [number, number];
}

/** 节点 cell style；`shapeOverride` 可换成已注册的 stencil（见 stencil-library.ts） */
export function nodeStyle(
  kind: NodeKind,
  shapeOverride?: string,
  styleOverride?: NodeStyleOverride,
): CellStyle {
  const shape = NODE_SHAPE[kind] ?? NODE_SHAPE.note;
  return {
    shape: shapeOverride ?? shape.shape,
    fillColor: styleOverride?.fillColor ?? shape.background,
    strokeColor: styleOverride?.strokeColor ?? shape.stroke,
    strokeWidth: 2,
    rounded: shape.shape === "rectangle",
    arcSize: 12,
    fontSize: 15,
    fontColor: "#0f172a",
    whiteSpace: "wrap",
    // 用纯文本标签（不用 foreignObject / HTML）：SVG 自包含，截图导出才可靠
    html: false,
    verticalAlign: shape.labelPosition === "bottom" ? "bottom" : "middle",
    align: "center",
    spacingTop: 8,
    spacingLeft: 10,
    spacingRight: 10,
    // 形状自带的投影，比纯色矩形更像「图元」
    shadow: 1,
  };
}

/** 关系 cell style（含正交布线） */
export function relationStyle(kind: RelationKind): CellStyle {
  const style = RELATION_STYLE[kind] ?? RELATION_STYLE["depends-on"];
  return {
    strokeColor: style.stroke,
    strokeWidth: 2,
    dashed: style.dashed,
    endArrow: style.endArrow,
    endFill: true,
    startArrow: style.startArrow,
    startFill: true,
    edgeStyle: "orthogonalEdgeStyle",
    rounded: true,
    fontSize: 13,
    fontColor: "#334155",
    html: false,
    labelBackgroundColor: "#ffffff",
  };
}
