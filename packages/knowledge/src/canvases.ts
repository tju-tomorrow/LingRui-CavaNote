/**
 * 概念画布 —— 笔记系统里的「一个概念一张图」
 *
 * ## 模型（完整画布）
 * 知识仍然全局（ROOT_NODES 一份，跨笔记共享），**画布是它的精选视图 + 自己的状态**：
 *   - `nodeIds`：这个画布包含哪些全局节点
 *   - `layout`：这个画布自己的位置（同一节点在不同画布里可摆不同地方）
 * 画布**不复制节点正文** —— N 张画布不会把节点数据复制 N 份。
 *
 * ## 生命周期（明确定义）
 * ```
 * create ──► 使用（rename / 加节点 / 拖动） ──► trash（软删，可恢复）
 *                                                  │
 *                                   restore ◄──────┤
 *                                                  ▼
 *                                             delete（硬删，画布实体消失）
 * ```
 * - 软删（`trashedAt`）与笔记一致：目录 / 列表都只看未删的。
 * - 硬删只删画布实体；全局节点不删（可能被别的画布/知识库引用）。
 * - `purgeEmptyCanvases` 清理「空且不在回收站」的孤儿画布（测试/误操作残留）。
 *
 * ## 大量资产（高并发量）的技术取舍
 * - 元信息与正文分离：列表只读 CanvasMeta（很小），不加载节点正文。
 * - 成员只存 id：画布与节点是引用关系，不是复制关系。
 * - 进一步扩展（>10³ 画布）时：把每张画布升级成 **Yjs 子文档（subdoc）**，
 *   只加载当前画布；本文件的 API 形状不变，换实现即可。
 */
import type * as Y from "yjs";
import { ROOT_CANVASES, type NodeId, type NodePosition } from "./schema";

export interface CanvasMeta {
  id: string;
  title: string;
  /** 归属笔记（可选）。一篇笔记里的概念画布共享它 */
  noteId?: string;
  /** 这个画布包含哪些全局节点 */
  nodeIds: NodeId[];
  /** 本画布自己的布局；缺省回落到全局 layout */
  layout: Record<NodeId, NodePosition>;
  createdAt: number;
  updatedAt: number;
  /** 软删除时间戳；有值 = 已进回收站，不参与常规列表 */
  trashedAt?: number;
}

export function getCanvases(doc: Y.Doc): Y.Map<CanvasMeta> {
  return doc.getMap<CanvasMeta>(ROOT_CANVASES);
}

function byCreated(a: CanvasMeta, b: CanvasMeta): number {
  return a.createdAt - b.createdAt;
}

/** 按创建时间排的全部画布（含回收站） */
export function listAllCanvases(doc: Y.Doc, noteId?: string): CanvasMeta[] {
  const all = [...getCanvases(doc).values()].sort(byCreated);
  return noteId ? all.filter((c) => c.noteId === noteId) : all;
}

/** 未进回收站的画布；给了 noteId 就只列这篇笔记的 */
export function listCanvases(doc: Y.Doc, noteId?: string): CanvasMeta[] {
  return listAllCanvases(doc, noteId).filter((c) => !c.trashedAt);
}

/** 回收站里的画布（最近删的在前） */
export function listTrashedCanvases(doc: Y.Doc): CanvasMeta[] {
  return [...getCanvases(doc).values()]
    .filter((c) => Boolean(c.trashedAt))
    .sort((a, b) => (b.trashedAt ?? 0) - (a.trashedAt ?? 0));
}

export function readCanvas(doc: Y.Doc, id: string): CanvasMeta | undefined {
  return getCanvases(doc).get(id);
}

export function upsertCanvas(doc: Y.Doc, canvas: CanvasMeta): void {
  getCanvases(doc).set(canvas.id, { ...canvas, updatedAt: Date.now() });
}

function newId(): string {
  return `canvas-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4).toString(36)}`;
}

/** 新建一个**完整**的概念画布：自己的空成员 + 空布局 + 干净时间戳 */
export function createCanvas(doc: Y.Doc, title = "概念画布", noteId?: string): CanvasMeta {
  const now = Date.now();
  const canvas: CanvasMeta = {
    id: newId(),
    title,
    ...(noteId ? { noteId } : {}),
    nodeIds: [],
    layout: {},
    createdAt: now,
    updatedAt: now,
  };
  upsertCanvas(doc, canvas);
  return canvas;
}

/** 软删（进回收站，可恢复） */
export function trashCanvas(doc: Y.Doc, id: string): boolean {
  const canvas = readCanvas(doc, id);
  if (!canvas) return false;
  upsertCanvas(doc, { ...canvas, trashedAt: Date.now() });
  return true;
}

/** 从回收站恢复 */
export function restoreCanvas(doc: Y.Doc, id: string): boolean {
  const canvas = readCanvas(doc, id);
  if (!canvas) return false;
  const { trashedAt: _drop, ...rest } = canvas;
  upsertCanvas(doc, rest);
  return true;
}

/** 硬删：画布实体消失（全局节点不删） */
export function deleteCanvas(doc: Y.Doc, id: string): boolean {
  const map = getCanvases(doc);
  if (!map.has(id)) return false;
  map.delete(id);
  return true;
}

export function renameCanvas(doc: Y.Doc, id: string, title: string): void {
  const canvas = readCanvas(doc, id);
  if (!canvas) return;
  upsertCanvas(doc, { ...canvas, title });
}

/** 改归属笔记（画布搬家） */
export function setCanvasNote(doc: Y.Doc, id: string, noteId: string | undefined): void {
  const canvas = readCanvas(doc, id);
  if (!canvas) return;
  const next: CanvasMeta = { ...canvas };
  if (noteId) next.noteId = noteId;
  else delete next.noteId;
  upsertCanvas(doc, next);
}

// ---------------------------------------------------------------------------
// 成员（节点）—— 引用，不复制
// ---------------------------------------------------------------------------

/** 把节点加入画布（幂等），可同时写入它们在本画布里的位置 */
export function addNodesToCanvas(
  doc: Y.Doc,
  canvasId: string,
  nodeIds: NodeId[],
  positions?: Record<NodeId, NodePosition>,
): CanvasMeta | undefined {
  const canvas = readCanvas(doc, canvasId);
  if (!canvas) return undefined;
  const set = new Set(canvas.nodeIds);
  for (const id of nodeIds) set.add(id);
  const layout = { ...canvas.layout };
  if (positions) for (const [id, at] of Object.entries(positions)) layout[id] = at;
  const next: CanvasMeta = { ...canvas, nodeIds: [...set], layout };
  upsertCanvas(doc, next);
  return next;
}

/** 只在这个画布里移动一个节点（不影响全局 layout） */
export function setCanvasNodePosition(
  doc: Y.Doc,
  canvasId: string,
  nodeId: NodeId,
  x: number,
  y: number,
  epsilon = 1,
): void {
  const canvas = readCanvas(doc, canvasId);
  if (!canvas) return;
  const current = canvas.layout[nodeId];
  if (current && Math.abs(current.x - x) < epsilon && Math.abs(current.y - y) < epsilon) return;
  upsertCanvas(doc, { ...canvas, layout: { ...canvas.layout, [nodeId]: { x, y } } });
}

/** 把节点移出画布（不删全局节点） */
export function removeNodesFromCanvas(doc: Y.Doc, canvasId: string, nodeIds: NodeId[]): void {
  const canvas = readCanvas(doc, canvasId);
  if (!canvas) return;
  const drop = new Set(nodeIds);
  const layout = { ...canvas.layout };
  for (const id of nodeIds) delete layout[id];
  upsertCanvas(doc, {
    ...canvas,
    nodeIds: canvas.nodeIds.filter((id) => !drop.has(id)),
    layout,
  });
}

// ---------------------------------------------------------------------------
// 清理（残留）
// ---------------------------------------------------------------------------

/**
 * 清掉「空的、且不在回收站」的孤儿画布。
 *
 * 什么时候会有：测试、误点 `/`、建了又没用。返回清掉的数量。
 * 刻意只清**空**的（`nodeIds.length === 0`），有内容的绝不碰。
 */
export function purgeEmptyCanvases(doc: Y.Doc): number {
  let removed = 0;
  const map = getCanvases(doc);
  for (const [id, canvas] of [...map.entries()]) {
    if (!canvas.trashedAt && canvas.nodeIds.length === 0) {
      map.delete(id);
      removed += 1;
    }
  }
  return removed;
}
