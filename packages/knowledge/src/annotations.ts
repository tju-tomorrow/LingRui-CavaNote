/**
 * Annotation / Chapter / Progress —— 知识模型 v1 新增的三类一等实体
 * （见 PRD/知识模型.md §2.2–§2.5、§3）
 *
 * 设计要点：
 *   - Annotation 是**用户画的东西**，与 KnowledgeNode 并列，都进 Y.Doc、都有稳定 id。
 *     一元素一条 Y.Map entry（key = annotationId）→ 元素级 LWW。
 *     手绘是高频写，元素级足够；同一元素并发编辑极罕见。
 *   - 之所以要把 `text` / `attachedTo` 从几何里单列出来：AI 要靠 id 精确引用
 *     （"把这个便签挪到网关右边"），只存裸 Excalidraw 元素做不到。
 *   - Progress 是**每个人自己的**，按 userId 分桶，避免协同下互相覆盖。
 */
import type * as Y from "yjs";
import {
  ROOT_ANNOTATIONS,
  ROOT_CHAPTERS,
  ROOT_PROGRESS,
  type AnnotationId,
  type AnnotationType,
  type ChapterId,
  type NodeId,
  type Provenance,
} from "./schema";

export type { AnnotationId, AnnotationType, ChapterId };

/** Excalidraw 元素子集：只留渲染与 AI 理解所需的最小字段 */
export interface AnnotationElement {
  type: AnnotationType;
  x: number;
  y: number;
  width: number;
  height: number;
  angle?: number;
  /** draw / arrow 的折线点 */
  points?: ReadonlyArray<readonly [number, number]>;
  strokeColor?: string;
  backgroundColor?: string;
  fillStyle?: string;
  roughness?: number;
  roundness?: unknown;
  /** 保留 Excalidraw 的 seed/version，保证重建时渲染一致 */
  seed?: number;
  version?: number;
}

export interface Annotation {
  id: AnnotationId;
  type: AnnotationType;
  /** 属于哪张概念画布；省略 = 旧数据 / 全局（回落到「全局那张图」） */
  canvasId?: string;
  /** 挂到某个节点；省略 = 自由注释（不隶属任何知识节点） */
  attachedTo?: NodeId;
  element: AnnotationElement;
  /** 便签/文本内容，单列便于 AI 引用与后续搜索 */
  text?: string;
  provenance: Provenance;
}

export interface Chapter {
  id: ChapterId;
  title: string;
  order: number;
  /** 属于哪张概念画布；省略 = 旧数据 / 全局 */
  canvasId?: string;
  /** 时间轴起始秒（分镜缩略图点击定位用） */
  startT?: number;
  /**
   * 来源：`auto`（从动作流推导，可随时被覆盖）/ `manual`（人工改过，不许覆盖）。
   *
   * 之前靠内存里的「上一次推导指纹」判断能不能覆盖 —— 刷新后那个指纹没了，
   * 于是既不敢覆盖也不再播种，分镜就永久停在旧数据上（演出明明已经往前走了）。
   */
  source?: "auto" | "manual";
}

export type ProgressState = "todo" | "learning" | "done";

export interface NodeProgress {
  state: ProgressState;
  updatedAt: number;
}

// ---------------------------------------------------------------------------
// Y.Doc accessors
// ---------------------------------------------------------------------------

export function getAnnotations(doc: Y.Doc): Y.Map<Annotation> {
  return doc.getMap<Annotation>(ROOT_ANNOTATIONS);
}

export function readAnnotation(doc: Y.Doc, id: AnnotationId): Annotation | undefined {
  return getAnnotations(doc).get(id);
}

export function upsertAnnotation(doc: Y.Doc, annotation: Annotation): void {
  getAnnotations(doc).set(annotation.id, annotation);
}

export function removeAnnotation(doc: Y.Doc, id: AnnotationId): boolean {
  const map = getAnnotations(doc);
  if (!map.has(id)) return false;
  map.delete(id);
  return true;
}

/** 列出挂在某个节点上的注释 */
export function annotationsOf(doc: Y.Doc, nodeId: NodeId): Annotation[] {
  const out: Annotation[] = [];
  for (const annotation of getAnnotations(doc).values()) {
    if (annotation.attachedTo === nodeId) out.push(annotation);
  }
  return out;
}

export function getChapters(doc: Y.Doc): Y.Array<Chapter> {
  return doc.getArray<Chapter>(ROOT_CHAPTERS);
}

/** 按 order 排序的章节列表 */
export function listChapters(doc: Y.Doc, canvasId?: string): Chapter[] {
  const all = [...getChapters(doc)].sort((a, b) => a.order - b.order);
  return canvasId ? all.filter((c) => c.canvasId === canvasId) : all;
}

export function upsertChapter(doc: Y.Doc, chapter: Chapter): void {
  const chapters = getChapters(doc);
  const index = chapters.toArray().findIndex((c) => c.id === chapter.id);
  if (index >= 0) chapters.delete(index, 1);
  chapters.push([chapter]);
}

/**
 * 整组替换（清空重写）。
 *
 * 用于「先推导、后人工改」的落盘（PRD/演出层.md §4）：分镜由动作流自动切分，
 * 种进 Y.Doc 一次；此后人工的重命名 / 合并 / 排序都改这份，不再被推导覆盖。
 */
export function replaceChapters(doc: Y.Doc, chapters: Chapter[]): void {
  const arr = getChapters(doc);
  arr.delete(0, arr.length);
  if (chapters.length > 0) arr.push(chapters);
}

/**
 * 只替换某张画布的分镜，其它画布的保留。
 * 画布是完整资产：分镜按 canvasId 隔离，切画布不会串场。
 */
export function replaceCanvasChapters(doc: Y.Doc, canvasId: string, chapters: Chapter[]): void {
  const arr = getChapters(doc);
  const others = arr.toArray().filter((c) => c.canvasId !== canvasId);
  const next = [...others, ...chapters.map((c) => ({ ...c, canvasId }))];
  arr.delete(0, arr.length);
  if (next.length > 0) arr.push(next);
}

// ---- progress：按 userId 分桶 ----

type ProgressRoot = Record<string, Record<NodeId, NodeProgress>>;

export function getProgressRoot(doc: Y.Doc): Y.Map<ProgressRoot> {
  return doc.getMap<ProgressRoot>(ROOT_PROGRESS);
}

/** 单机（无协同）时的桶名 */
export const LOCAL_USER = "local";

export function readProgress(
  doc: Y.Doc,
  nodeId: NodeId,
  userId: string = LOCAL_USER,
): NodeProgress | undefined {
  return getProgressRoot(doc).toJSON()[userId]?.[nodeId];
}

export function setProgress(
  doc: Y.Doc,
  nodeId: NodeId,
  state: ProgressState,
  userId: string = LOCAL_USER,
): void {
  const root = getProgressRoot(doc);
  const current = root.toJSON();
  const bucket = { ...(current[userId] ?? {}) };
  bucket[nodeId] = { state, updatedAt: Date.now() };
  // 整桶写回：桶是 per-user 的，不存在多人互相覆盖的问题
  root.set(userId, bucket);
}

export function listProgress(doc: Y.Doc, userId: string = LOCAL_USER): Record<NodeId, NodeProgress> {
  return { ...(getProgressRoot(doc).toJSON()[userId] ?? {}) };
}
