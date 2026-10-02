/**
 * Knowledge → maxGraph 绑定（ADR-0013）
 *
 * 纯函数：把 Y.Doc 里的 KnowledgeNode + layout 变成**引擎中立的 cell 规格**，
 * 以及「从当前场景同步到期望场景」的增删改计划。不碰 DOM / maxGraph 实例，
 * 便于单测（`mxgraph-binding.test.ts`）。
 *
 * 不变量（沿用 ADR-0003 / ADR-0011）：
 *   - cell id 直接沿用 Knowledge id（节点 `nodeId`、边 `edge-<relationId>`），AI 按 id 寻址。
 *   - 正文永远在 Y.Doc，cell 只存 `label`（表现）。
 */
import type { Annotation, KnowledgeNode, NodeKind, Relation } from "@lingrui/knowledge";
import { annotationToSpec, type AnnotationSpec } from "./annotation-binding";
import { nodeSize, nodeStyle, relationStyle, type CellStyle, type NodeStyleOverride } from "./shapes";

export type Layout = Record<string, { x: number; y: number }>;

export interface VertexSpec {
  /** cell id = nodeId */
  id: string;
  nodeId: string;
  kind: NodeKind;
  /** HTML 标签 */
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  style: CellStyle;
  /** 方便引擎/覆盖层回读 */
  customData: { lingrui: true; nodeId: string; kind: NodeKind };
}

export interface EdgeSpec {
  /** cell id = edge-<relationId> */
  id: string;
  relationId: string;
  source: string;
  target: string;
  label?: string;
  style: CellStyle;
  customData: { lingrui: true; kind: "relation" };
}

export interface GraphSpec {
  vertices: VertexSpec[];
  edges: EdgeSpec[];
  /** 用户/AI 画的注释（便签/文本/高亮/形状/手绘/箭头） */
  annotations: AnnotationSpec[];
}

/** 节点标签：标题 + 摘要（纯文本两行，便于 SVG 自包含导出） */
export function nodeLabel(node: KnowledgeNode): string {
  return node.summary ? `${node.title}\n${node.summary}` : node.title;
}

export function vertexOf(node: KnowledgeNode, layout: Layout): VertexSpec {
  const rawStyle = node.meta?.["style"];
  const styleOverride =
    typeof rawStyle === "object" && rawStyle !== null ? (rawStyle as NodeStyleOverride) : undefined;
  const size = styleOverride?.size
    ? { width: styleOverride.size[0], height: styleOverride.size[1] }
    : nodeSize(node.kind);
  const at = layout[node.id] ?? { x: 0, y: 0 };
  const shapeOverride =
    typeof node.meta?.["shape"] === "string" ? (node.meta["shape"] as string) : undefined;
  return {
    id: node.id,
    nodeId: node.id,
    kind: node.kind,
    label: nodeLabel(node),
    x: at.x,
    y: at.y,
    width: size.width,
    height: size.height,
    style: nodeStyle(node.kind, shapeOverride, styleOverride),
    customData: { lingrui: true, nodeId: node.id, kind: node.kind },
  };
}

export function edgeOf(from: KnowledgeNode, relation: Relation): EdgeSpec {
  return {
    id: `edge-${relation.id}`,
    relationId: relation.id,
    source: from.id,
    target: relation.to,
    ...(relation.label ? { label: relation.label } : {}),
    style: relationStyle(relation.kind),
    customData: { lingrui: true, kind: "relation" },
  };
}

/**
 * Knowledge → 期望图。
 * 只产出两端都存在的关系（悬空 relation 由 AI 工具校验，这里兜底跳过）。
 */
export function buildGraphSpec(
  nodes: KnowledgeNode[],
  layout: Layout,
  annotations: Annotation[] = [],
): GraphSpec {
  const known = new Set(nodes.map((n) => n.id));
  const vertices = nodes.map((node) => vertexOf(node, layout));
  const edges: EdgeSpec[] = [];
  for (const node of nodes) {
    for (const relation of node.relations) {
      if (!known.has(relation.to)) continue;
      edges.push(edgeOf(node, relation));
    }
  }
  return { vertices, edges, annotations: annotations.map(annotationToSpec) };
}

// ---------------------------------------------------------------------------
// 同步计划（引擎执行，纯函数先算）
// ---------------------------------------------------------------------------

export interface SyncPlan {
  /** 需要的 cell id（供引擎建/更新） */
  vertexIds: string[];
  edgeIds: string[];
  annotationIds: string[];
  /** 需要删除的 cell id */
  removeIds: string[];
  stats: { added: number; updated: number; removed: number };
}

/**
 * 算出「当前场景 → 期望图」要删哪些、加/改哪些。
 *
 * 语义：
 *   - 期望里有、当前没有 → 新增
 *   - 期望里有、当前也有 → 更新（几何/标签/样式，引擎按 id set 一遍即可）
 *   - 当前有、期望没有、且是我们的（lingrui）→ 删除
 *   - 非 lingrui 的cell → 原样保留（不列入 removeIds）
 */
export function planGraphSync(
  spec: GraphSpec,
  current: { lingruiIds: string[] },
): SyncPlan {
  const desired = new Set<string>([
    ...spec.vertices.map((v) => v.id),
    ...spec.edges.map((e) => e.id),
    ...spec.annotations.map((a) => a.id),
  ]);
  const existing = new Set(current.lingruiIds);

  let added = 0;
  let updated = 0;
  for (const id of desired) {
    if (existing.has(id)) updated += 1;
    else added += 1;
  }

  const removeIds: string[] = [];
  for (const id of existing) {
    if (!desired.has(id)) removeIds.push(id);
  }

  return {
    vertexIds: spec.vertices.map((v) => v.id),
    edgeIds: spec.edges.map((e) => e.id),
    annotationIds: spec.annotations.map((a) => a.id),
    removeIds,
    stats: { added, updated, removed: removeIds.length },
  };
}
