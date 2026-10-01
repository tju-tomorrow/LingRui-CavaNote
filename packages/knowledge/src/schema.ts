/**
 * @lingrui/knowledge — 唯一真相
 *
 * 产品的最高原则：Knowledge 拥有"知识是什么"，其他层只拥有"知识怎么显示"。
 * 文档块、画布元素、动画关键帧都只持有 KnowledgeNode.id。
 */
import * as Y from "yjs";

/** 基建实体 + 通用知识实体 */
export type NodeKind =
  | "client" // 用户 / 调用方
  | "gateway" // 网关
  | "service" // 后端服务
  | "cache" // Redis 等缓存
  | "database" // MySQL / Postgres
  | "queue" // 消息队列
  | "registry" // 服务注册 / 配置中心
  | "monitor" // 监控 / 日志
  | "concept" // 抽象概念
  | "note"; // 纯笔记

export type RelationKind =
  | "calls"
  | "reads"
  | "writes"
  | "publishes"
  | "subscribes"
  | "references"
  | "depends-on";

export interface Relation {
  id: string;
  to: NodeId;
  kind: RelationKind;
  label?: string;
  /** 可选：这条关系在画布上的箭头元素 id */
  edgeElementId?: string;
}

/** 画布视图的绑定：只存表现信息，不存正文 */
export interface CanvasBinding {
  elementId: string;
  x: number;
  y: number;
}

export type NodeId = string;

export interface KnowledgeNode {
  id: NodeId;
  kind: NodeKind;
  title: string;
  /** 一句话摘要，用于画布卡片 */
  summary?: string;
  /** 文档视图里的块 id（BlockNote blockId） */
  blockId?: string;
  /** 画布视图里的元素绑定 */
  canvas?: CanvasBinding;
  relations: Relation[];
  /** 自由元数据（技术栈、标签、外部链接…） */
  meta?: Record<string, unknown>;
}

export interface KnowledgeDocMeta {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
}

// ---------------------------------------------------------------------------
// Y.Doc schema
// ---------------------------------------------------------------------------

export const ROOT_META = "meta";
export const ROOT_NODES = "nodes";
export const ROOT_ORDER = "order";

export function createKnowledgeDoc(meta: Pick<KnowledgeDocMeta, "id" | "title">): Y.Doc {
  const doc = new Y.Doc({ guid: meta.id });
  const now = Date.now();
  doc.getMap<KnowledgeDocMeta>(ROOT_META).set(meta.id, {
    id: meta.id,
    title: meta.title,
    createdAt: now,
    updatedAt: now,
  });
  doc.getMap<KnowledgeNode>(ROOT_NODES);
  doc.getArray<NodeId>(ROOT_ORDER);
  return doc;
}

export function getNodes(doc: Y.Doc): Y.Map<KnowledgeNode> {
  return doc.getMap<KnowledgeNode>(ROOT_NODES);
}

export function getOrder(doc: Y.Doc): Y.Array<NodeId> {
  return doc.getArray<NodeId>(ROOT_ORDER);
}

/**
 * 节点以**普通 JSON 对象**存在 Y.Map 里。
 * 好处：读出来就是 KnowledgeNode，不用递归 toJSON；
 * 代价：并发改同一个节点是整对象 last-write-wins（P0 可接受，P1 再拆成 Y.Map 字段）。
 */
export function readNode(doc: Y.Doc, id: NodeId): KnowledgeNode | undefined {
  return getNodes(doc).get(id);
}

export function upsertNode(doc: Y.Doc, node: KnowledgeNode): void {
  const nodes = getNodes(doc);
  doc.transact(() => {
    nodes.set(node.id, node);
    const order = getOrder(doc);
    if (!order.toArray().includes(node.id)) order.push([node.id]);
  });
}

export function removeNode(doc: Y.Doc, id: NodeId): void {
  doc.transact(() => {
    getNodes(doc).delete(id);
    const order = getOrder(doc);
    const idx = order.toArray().indexOf(id);
    if (idx >= 0) order.delete(idx, 1);
  });
}

/**
 * 绑定：把文档块 / 画布元素挂到某个节点上。
 * 这就是"一个节点，多个视图"的实现入口。
 */
export function bindBlock(doc: Y.Doc, id: NodeId, blockId: string): void {
  const node = readNode(doc, id);
  if (!node) throw new Error(`unknown node: ${id}`);
  upsertNode(doc, { ...node, blockId });
}

export function bindCanvas(doc: Y.Doc, id: NodeId, canvas: CanvasBinding): void {
  const node = readNode(doc, id);
  if (!node) throw new Error(`unknown node: ${id}`);
  upsertNode(doc, { ...node, canvas });
}

/** 反查：画布元素 id → 节点 id */
export function nodeIdByCanvasElement(doc: Y.Doc, elementId: string): NodeId | undefined {
  for (const [id, node] of getNodes(doc)) {
    if (node.canvas?.elementId === elementId) return id;
  }
  return undefined;
}
