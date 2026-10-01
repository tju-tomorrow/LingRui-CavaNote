/**
 * Annotation ↔ Excalidraw 元素（PRD/知识模型.md §2.3）
 *
 * 关键设计：**Annotation 的 id 直接沿用 Excalidraw 元素的 id**。
 * 这样用户画完 → 落进 Y.Doc → 再派生回场景时，元素 id 不变，
 * `diffScene` 能直接复用同一个元素（零重建、不闪、id 稳定）。
 *
 * 元素的归属靠 customData 区分：
 *   - `{ lingrui: true, nodeId }`            → Knowledge 节点/箭头（派生）
 *   - `{ lingrui: true, annotationId }`      → Annotation（用户画的，但已进 Y.Doc）
 *   - 两者都没有                              → 正在画 / 尚未落盘
 */
import type { Annotation, AnnotationElement, AnnotationType } from "@lingrui/knowledge";
import type { ElementSkeleton } from "./excalidraw-binding";

/** 只依赖我们真正用到的字段 */
export interface ExcalidrawLike {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  angle?: number;
  points?: ReadonlyArray<readonly [number, number]>;
  strokeColor?: string;
  backgroundColor?: string;
  fillStyle?: string;
  roughness?: number;
  roundness?: unknown;
  seed?: number;
  version?: number;
  text?: string;
  containerId?: string | null;
  customData?: unknown;
}

const EXCALIDRAW_TO_ANNOTATION: Record<string, AnnotationType> = {
  freedraw: "draw",
  line: "arrow",
  arrow: "arrow",
  text: "text",
  rectangle: "shape",
  ellipse: "shape",
  diamond: "shape",
};

const ANNOTATION_TO_EXCALIDRAW: Record<AnnotationType, string> = {
  draw: "freedraw",
  sticky: "rectangle",
  text: "text",
  highlight: "rectangle",
  arrow: "arrow",
  shape: "rectangle",
};

/** 便签用 Excalidraw 的 sticky 还是普通矩形？这里用矩形 + 固定底色，跨版本更稳 */
const STICKY_STYLE = { backgroundColor: "#fff7e0", strokeColor: "#b45309" } as const;
const HIGHLIGHT_STYLE = { backgroundColor: "#fff3bf", strokeColor: "transparent" } as const;

export function isAnnotationElement(element: { customData?: unknown }): boolean {
  const data = element.customData as { annotationId?: string } | undefined;
  return typeof data?.annotationId === "string";
}

export function annotationIdOf(element: { customData?: unknown; id?: string }): string | undefined {
  const data = element.customData as { annotationId?: string } | undefined;
  return data?.annotationId ?? (isAnnotationElement(element) ? element.id : undefined);
}

/** 我们自己的 Knowledge 元素（节点、箭头、节点标签）——不是注释 */
export function isNodeElement(element: { customData?: unknown }): boolean {
  const data = element.customData as { lingrui?: boolean; annotationId?: string } | undefined;
  return Boolean(data?.lingrui) && !data?.annotationId;
}

/** 从 Excalidraw 元素抽出几何子集 */
function toAnnotationElement(element: ExcalidrawLike, type: AnnotationType): AnnotationElement {
  const base: AnnotationElement = {
    type,
    x: element.x,
    y: element.y,
    width: element.width,
    height: element.height,
    angle: element.angle,
    strokeColor: element.strokeColor,
    backgroundColor: element.backgroundColor,
    fillStyle: element.fillStyle,
    roughness: element.roughness,
    roundness: element.roundness,
    seed: element.seed,
    version: element.version,
  };
  if (type === "draw" || type === "arrow") {
    base.points = element.points ?? [];
  }
  if (type === "sticky") Object.assign(base, STICKY_STYLE);
  if (type === "highlight") Object.assign(base, HIGHLIGHT_STYLE);
  return base;
}

/**
 * Excalidraw 元素 → Annotation。
 * `text` 由调用方提供（容器元素上的文字在它绑定的 text 子元素里，需要查表）。
 */
export function elementToAnnotation(
  element: ExcalidrawLike,
  options: { text?: string; previous?: Annotation; now?: () => number } = {},
): Annotation {
  const type = EXCALIDRAW_TO_ANNOTATION[element.type] ?? "shape";
  const now = options.now ?? Date.now;

  return {
    id: element.id,
    type,
    // 上一次已经挂到某个节点上，就保留这个归属
    ...(options.previous?.attachedTo ? { attachedTo: options.previous.attachedTo } : {}),
    element: toAnnotationElement(element, type),
    ...(options.text ? { text: options.text } : {}),
    provenance: options.previous?.provenance?.origin === "ai"
      ? options.previous.provenance
      : { origin: "human", dirty: true, at: now() },
  };
}

/** 判断注释的几何/文本是否变了（避免 onChange → Y.Doc → 场景 的死循环） */
export function sameAnnotation(a: Annotation, b: Annotation): boolean {
  if (a.type !== b.type || a.text !== b.text || a.attachedTo !== b.attachedTo) return false;
  const x = a.element;
  const y = b.element;
  return (
    Math.abs(x.x - y.x) < 1 &&
    Math.abs(x.y - y.y) < 1 &&
    Math.abs(x.width - y.width) < 1 &&
    Math.abs(x.height - y.height) < 1 &&
    (x.points?.length ?? 0) === (y.points?.length ?? 0)
  );
}

/** Annotation → Excalidraw skeleton（id 沿用 annotation.id，保证稳定） */
export function annotationToExcalidrawElement(annotation: Annotation): ElementSkeleton {
  const { element } = annotation;
  // 便签/高亮有默认配色；元素自带颜色时以元素为准
  const defaults =
    annotation.type === "sticky"
      ? STICKY_STYLE
      : annotation.type === "highlight"
        ? HIGHLIGHT_STYLE
        : undefined;

  const skeleton: ElementSkeleton = {
    type: ANNOTATION_TO_EXCALIDRAW[annotation.type],
    id: annotation.id,
    x: element.x,
    y: element.y,
    width: element.width,
    height: element.height,
    strokeColor: element.strokeColor ?? defaults?.strokeColor ?? "#1e1e1e",
    backgroundColor: element.backgroundColor ?? defaults?.backgroundColor ?? "transparent",
    fillStyle: element.fillStyle ?? "solid",
    roughness: element.roughness ?? 1.4,
    roundness: element.roundness ?? null,
    customData: {
      lingrui: true,
      annotationId: annotation.id,
      annotationType: annotation.type,
    },
  };

  if (element.points && (annotation.type === "draw" || annotation.type === "arrow")) {
    skeleton.points = element.points;
  }
  if (annotation.type === "text" && annotation.text) {
    skeleton.text = annotation.text;
  }
  return skeleton;
}

// ---------------------------------------------------------------------------
// 同步计划：场景 → Y.Doc
// ---------------------------------------------------------------------------

export interface AnnotationSyncPlan {
  /** 需要写入 Y.Doc 的注释（新增或改动） */
  upserts: Annotation[];
  /** 需要从 Y.Doc 移除的注释 id */
  removals: string[];
}

/** 取容器元素上绑定的文字（Excalidraw 把标签放在单独的子元素里） */
function boundTextOf(containerId: string, scene: readonly ExcalidrawLike[]): string | undefined {
  const bound = scene.find((el) => el.type === "text" && el.containerId === containerId);
  return bound?.text;
}

/**
 * 算出"场景 → Y.Doc"该做的改动。
 *
 * 纯函数，不碰 Y.Doc，便于单测。调用方（CanvasStage）负责落地。
 *
 * `seenOnce` 用来避免误删：刚写进 Y.Doc 的注释可能还没在场景里出现，
 * 只有"曾在场景里出现过、现在不见了"才判定为被用户删除。
 */
export function planAnnotationSync(
  scene: readonly ExcalidrawLike[],
  docAnnotations: readonly Annotation[],
  seenOnce: Set<string>,
  options: { now?: () => number } = {},
): AnnotationSyncPlan {
  const docById = new Map(docAnnotations.map((a) => [a.id, a]));
  const present = new Set<string>();
  const upserts: Annotation[] = [];

  for (const element of scene) {
    if (isNodeElement(element)) continue;

    const id = annotationIdOf(element) ?? element.id;
    present.add(id);
    seenOnce.add(id);

    const previous = docById.get(id);
    const text = element.text ?? boundTextOf(element.id, scene) ?? previous?.text;
    const next = elementToAnnotation(element, { text, previous, now: options.now });

    // 只在真的变了才写，避免 onChange → Y.Doc → 场景 的自激循环
    if (!previous || !sameAnnotation(previous, next)) upserts.push(next);
  }

  const removals: string[] = [];
  for (const annotation of docAnnotations) {
    if (present.has(annotation.id)) continue;
    if (!seenOnce.has(annotation.id)) continue;
    removals.push(annotation.id);
    seenOnce.delete(annotation.id);
  }

  return { upserts, removals };
}
