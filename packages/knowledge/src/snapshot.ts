/**
 * CanvasSnapshot —— 喂给 AI 的结构化上下文（PRD/知识模型.md §4）
 *
 * 与截图**同版本冻结**（ADR-0011）：Context Packer 先 freeze 出 version，
 * 截图和这份数据都打上同一个 version，避免两者漂移。
 *
 * 同一格式既作喂 AI 的导出，也作持久化读取（单一格式，避免两套）。
 */
import type * as Y from "yjs";
import {
  getLayout,
  getNodes,
  getOrder,
  type KnowledgeNode,
  type NodeId,
  type NodeKind,
  type Provenance,
  type RelationKind,
} from "./schema";
import { getAnnotations, listChapters, type AnnotationId, type AnnotationType, type Chapter } from "./annotations";

export interface SnapshotViewport {
  scrollX: number;
  scrollY: number;
  zoom: number;
  width: number;
  height: number;
}

export interface SnapshotNode {
  id: NodeId;
  kind: NodeKind;
  title: string;
  summary?: string;
  roles?: string[];
  /** 画布坐标 */
  at: [number, number];
  /** 画布尺寸 —— 让 AI 能把像素和 id 对上 */
  size: [number, number];
  provenance?: Provenance;
}

export interface SnapshotRelation {
  from: NodeId;
  to: NodeId;
  kind: RelationKind;
  label?: string;
}

export interface SnapshotAnnotation {
  id: AnnotationId;
  type: AnnotationType;
  text?: string;
  /** [x, y, w, h] */
  bbox: [number, number, number, number];
  attachedTo?: NodeId;
  provenance: Provenance;
}

export interface CanvasSnapshot {
  /** 单调递增，用于保证"截图与数据同一时刻" */
  version: number;
  viewport: SnapshotViewport;
  nodes: SnapshotNode[];
  relations: SnapshotRelation[];
  annotations: SnapshotAnnotation[];
  chapters: Chapter[];
  focus?: NodeId;
  /** 冻结时刻（毫秒） */
  capturedAt: number;
}

export interface SerializeOptions {
  version: number;
  viewport: SnapshotViewport;
  /** 未指定时的节点默认尺寸（与画布 NODE_SIZE 保持一致） */
  nodeSize?: [number, number];
  focus?: NodeId;
  now?: () => number;
}

export function serializeScene(doc: Y.Doc, options: SerializeOptions): CanvasSnapshot {
  const { version, viewport, nodeSize = [250, 96], focus } = options;
  const now = options.now ?? Date.now;

  const nodesMap = getNodes(doc);
  const order = getOrder(doc).toArray();
  const ids = order.length > 0 ? order : [...nodesMap.keys()];
  const layout = getLayout(doc).toJSON();

  const nodes: SnapshotNode[] = [];
  const relations: SnapshotRelation[] = [];

  for (const id of ids) {
    const node: KnowledgeNode | undefined = nodesMap.get(id);
    if (!node) continue;

    const at = layout[id];
    nodes.push({
      id: node.id,
      kind: node.kind,
      title: node.title,
      summary: node.summary,
      roles: node.roles,
      at: [at?.x ?? 0, at?.y ?? 0],
      size: [nodeSize[0], nodeSize[1]],
      provenance: node.provenance,
    });

    for (const relation of node.relations) {
      relations.push({
        from: node.id,
        to: relation.to,
        kind: relation.kind,
        label: relation.label,
      });
    }
  }

  const annotations: SnapshotAnnotation[] = [];
  for (const annotation of getAnnotations(doc).values()) {
    const { element } = annotation;
    annotations.push({
      id: annotation.id,
      type: annotation.type,
      text: annotation.text,
      bbox: [element.x, element.y, element.width, element.height],
      attachedTo: annotation.attachedTo,
      provenance: annotation.provenance,
    });
  }

  return {
    version,
    viewport,
    nodes,
    relations,
    annotations,
    chapters: listChapters(doc),
    focus,
    capturedAt: now(),
  };
}

/** 供人读/调试的紧凑摘要（不替代结构化数据） */
export function summarizeSnapshot(snapshot: CanvasSnapshot): string {
  const { nodes, relations, annotations } = snapshot;
  const human = nodes.filter((n) => n.provenance?.origin === "human").length;
  return [
    `v${snapshot.version}`,
    `${nodes.length} 节点（人改过 ${human}）`,
    `${relations.length} 关系`,
    `${annotations.length} 注释`,
    `${snapshot.chapters.length} 章节`,
  ].join(" · ");
}
