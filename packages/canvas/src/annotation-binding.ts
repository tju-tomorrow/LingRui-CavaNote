/**
 * Annotation → maxGraph 绑定（ADR-0013；承接 PRD/知识模型.md §2.3）
 *
 * Annotation 是**用户/AI 画的东西**，与 KnowledgeNode 并列、都进 Y.Doc、都有稳定 id。
 * 换成 maxGraph 后这条链路一度断掉（画出来看不见、AI annotate 石沉大海）——
 * 这里把它接回来：`id` 直接沿用 annotation.id，和节点一样按 id 增量 upsert。
 *
 * 引擎无关的纯函数，便于单测。
 */
import type { Annotation, AnnotationType } from "@lingrui/knowledge";
import type { CellStyle } from "./shapes";

/** 图中一条注释的渲染规格 */
export interface AnnotationSpec {
  /** cell id = annotation.id（稳定可寻址） */
  id: string;
  annotationId: string;
  type: AnnotationType;
  /** 顶点（便签/文本/高亮/形状）还是浮动折线（手绘/箭头） */
  kind: "vertex" | "edge";
  x: number;
  y: number;
  width: number;
  height: number;
  /** edge 用：绝对坐标折线点 */
  points?: Array<[number, number]>;
  value?: string;
  style: CellStyle;
}

const STICKY = { fill: "#fff7e0", stroke: "#b45309" } as const;
const HIGHLIGHT = { fill: "#fde047" } as const;

/** Excalidraw 的 points 是相对元素的；maxGraph 浮动边要绝对坐标 */
function absolutePoints(
  annotation: Annotation,
): Array<[number, number]> | undefined {
  const { element } = annotation;
  const raw = element.points;
  if (!raw || raw.length < 2) return undefined;
  return raw.map(([px, py]) => [element.x + px, element.y + py]);
}

function strokeOf(annotation: Annotation, fallback: string): string {
  return annotation.element.strokeColor ?? fallback;
}

export function annotationToSpec(annotation: Annotation): AnnotationSpec {
  const { element } = annotation;
  const base = {
    id: annotation.id,
    annotationId: annotation.id,
    type: annotation.type,
    x: element.x,
    y: element.y,
    width: element.width,
    height: element.height,
  };

  switch (annotation.type) {
    case "sticky":
      return {
        ...base,
        kind: "vertex",
        value: annotation.text ?? "",
        style: {
          shape: "rectangle",
          fillColor: element.backgroundColor ?? STICKY.fill,
          strokeColor: strokeOf(annotation, STICKY.stroke),
          strokeWidth: 1.5,
          align: "left",
          verticalAlign: "top",
          whiteSpace: "wrap",
          fontSize: 14,
          fontColor: "#3f2d0b",
          spacingLeft: 8,
          spacingRight: 8,
          spacingTop: 6,
          shadow: 1,
        },
      };

    case "text":
      return {
        ...base,
        kind: "vertex",
        value: annotation.text ?? "",
        style: {
          shape: "rectangle",
          fillColor: "none",
          strokeColor: "none",
          align: "left",
          verticalAlign: "top",
          whiteSpace: "wrap",
          fontSize: 16,
          fontColor: strokeOf(annotation, "#1e1e1e"),
        },
      };

    case "highlight":
      return {
        ...base,
        kind: "vertex",
        style: {
          shape: "rectangle",
          fillColor: element.backgroundColor ?? HIGHLIGHT.fill,
          strokeColor: "none",
          opacity: 0.4,
        },
      };

    case "shape":
      return {
        ...base,
        kind: "vertex",
        style: {
          shape: "rectangle",
          fillColor: element.backgroundColor ?? "none",
          strokeColor: strokeOf(annotation, "#1e1e1e"),
          strokeWidth: 2,
          dashed: element.fillStyle === "none",
          rounded: false,
        },
      };

    case "arrow":
      return {
        ...base,
        kind: "edge",
        points: absolutePoints(annotation),
        style: {
          strokeColor: strokeOf(annotation, "#1971c2"),
          strokeWidth: 2,
          endArrow: "classic",
          endFill: true,
          dashed: element.fillStyle === "none",
        },
      };

    case "draw":
      return {
        ...base,
        kind: "edge",
        points: absolutePoints(annotation),
        style: {
          strokeColor: strokeOf(annotation, "#1e1e1e"),
          strokeWidth: 2,
          endArrow: "none",
          rounded: true,
        },
      };
  }
}

/** 新建注释时的默认几何/样式（工具栏与 AI 共用） */
export function defaultAnnotation(
  type: AnnotationType,
  at: [number, number],
  options: { id: string; text?: string; attachedTo?: string } = { id: "" },
): Annotation {
  const [x, y] = at;
  const size: Record<AnnotationType, [number, number]> = {
    sticky: [180, 120],
    text: [200, 40],
    highlight: [220, 60],
    shape: [180, 110],
    arrow: [200, 0],
    draw: [200, 120],
  };
  const [width, height] = size[type];
  return {
    id: options.id,
    type,
    ...(options.attachedTo ? { attachedTo: options.attachedTo } : {}),
    element: { type, x, y, width, height },
    ...(options.text ? { text: options.text } : {}),
    provenance: { origin: "human", dirty: true, at: Date.now() },
  };
}
