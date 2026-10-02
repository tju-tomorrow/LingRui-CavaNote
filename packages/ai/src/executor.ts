/**
 * Canvas 工具执行器 —— AI 真正修改画布的地方
 *
 * 设计原则（ADR-0011）：
 *   1. 工具只通过 `@lingrui/knowledge` 改 Y.Doc，不直接碰画布（画布是派生的）。
 *   2. 每次调用产出 `@lingrui/anim` 的 SceneScript 动作，落盘与演出共用一条动作流。
 *   3. **三级保险**：按 risk 分类，破坏人的元素时不直接应用，而是返回 pending 补丁。
 *   4. 纯函数式输入输出，不依赖 React / 浏览器，可直接单测。
 */
import type * as Y from "yjs";
import {
  getNodes,
  isHumanOwned,
  readAnnotation,
  readNode,
  removeAnnotation,
  removeNode,
  setLayoutPosition,
  upsertAnnotation,
  upsertNode,
  type Annotation,
  type AnnotationElement,
  type AnnotationType,
  type KnowledgeNode,
  type NodeKind,
  type RelationKind,
} from "@lingrui/knowledge";
import { EMPHASIS_STYLES, type Action, type EmphasisStyle } from "@lingrui/anim";

// ---------------------------------------------------------------------------
// 入参
// ---------------------------------------------------------------------------

export interface SpawnNodeInput {
  id: string;
  kind: NodeKind;
  title: string;
  summary?: string;
  /** 真实设备/网络图标（stencil key，如 net.firewall / rack.1u-rack-server） */
  shape?: string;
  at: [number, number];
}

export interface UpdateNodeInput {
  id: string;
  title?: string;
  summary?: string;
  kind?: NodeKind;
  shape?: string;
}

export interface MoveNodeInput {
  id: string;
  x: number;
  y: number;
}

export interface DeleteNodeInput {
  id: string;
}

export interface ConnectInput {
  from: string;
  to: string;
  kind: RelationKind;
  label?: string;
}

export interface DisconnectInput {
  from: string;
  to: string;
}

export interface SetStyleInput {
  id: string;
  style: Record<string, unknown>;
}

export interface FlowInput {
  from: string;
  to: string;
  label?: string;
}

export interface AnnotateInput {
  /** 省略则自动生成 */
  id?: string;
  type: AnnotationType;
  /** 挂到某个节点；省略 = 自由注释 */
  attachedTo?: string;
  element: AnnotationElement;
  text?: string;
}

export interface UpdateAnnotationInput {
  id: string;
  text?: string;
  element?: Partial<AnnotationElement>;
}

export interface DeleteAnnotationInput {
  id: string;
}

export interface FocusInput {
  nodeId: string;
}

export interface EmphasizeInput {
  nodeId: string;
  /** 手绘强调样式：圈 / 框 / 下划线 / 叉 / 高亮 */
  style: EmphasisStyle;
  text?: string;
}

export interface NarrateInput {
  text: string;
  nodeId?: string;
}

export interface LoadAssetInput {
  /** 想谈的名词（标题 / 摘要 / 标签 / 类型模糊匹配） */
  query: string;
  /** 只在这些类型里找 */
  kinds?: NodeKind[];
  /** 最多返回几个候选（默认 6） */
  limit?: number;
}

export type CanvasToolCall =
  | { name: "loadAsset"; input: LoadAssetInput }
  | { name: "spawnNode"; input: SpawnNodeInput }
  | { name: "updateNode"; input: UpdateNodeInput }
  | { name: "moveNode"; input: MoveNodeInput }
  | { name: "deleteNode"; input: DeleteNodeInput }
  | { name: "connect"; input: ConnectInput }
  | { name: "disconnect"; input: DisconnectInput }
  | { name: "setStyle"; input: SetStyleInput }
  | { name: "flow"; input: FlowInput }
  | { name: "focus"; input: FocusInput }
  | { name: "emphasize"; input: EmphasizeInput }
  | { name: "narrate"; input: NarrateInput }
  | { name: "annotate"; input: AnnotateInput }
  | { name: "updateAnnotation"; input: UpdateAnnotationInput }
  | { name: "deleteAnnotation"; input: DeleteAnnotationInput };

// ---------------------------------------------------------------------------
// 出参
// ---------------------------------------------------------------------------

/** 三级保险的分类（ADR-0011 §5） */
export type RiskLevel =
  | "add" // 新增类：直接应用
  | "mutate" // 修改类：改到人的元素时需确认
  | "destructive"; // 破坏类：删人的元素时需确认

export interface ToolContext {
  doc: Y.Doc;
  /** 当前时间轴位置（秒） */
  t: number;
  /** 当前概念画布 id（有的话，新建的 Annotation 归它，做到画布间隔离） */
  canvasId?: string;
}

export interface ToolResult {
  ok: boolean;
  risk: RiskLevel;
  /** 是否已经写入 Knowledge；false 表示进了待确认队列 */
  applied: boolean;
  message: string;
  actions: Action[];
  /** 需要用户确认时，带上原始调用与原因 */
  pending?: { call: CanvasToolCall; reason: string };
}

// ---------------------------------------------------------------------------
// 执行入口
// ---------------------------------------------------------------------------

export function executeTool(ctx: ToolContext, call: CanvasToolCall): ToolResult {
  switch (call.name) {
    case "loadAsset":
      return loadAsset(ctx, call.input);
    case "spawnNode":
      return spawnNode(ctx, call.input);
    case "updateNode":
      return updateNode(ctx, call.input);
    case "moveNode":
      return moveNode(ctx, call.input);
    case "deleteNode":
      return deleteNode(ctx, call.input);
    case "connect":
      return connect(ctx, call.input);
    case "disconnect":
      return disconnect(ctx, call.input);
    case "setStyle":
      return setStyle(ctx, call.input);
    case "flow":
      return flow(ctx, call.input);
    case "focus":
      return focus(ctx, call.input);
    case "emphasize":
      return emphasize(ctx, call.input);
    case "narrate":
      return narrate(ctx, call.input);
    case "annotate":
      return annotate(ctx, call.input);
    case "updateAnnotation":
      return updateAnnotation(ctx, call.input);
    case "deleteAnnotation":
      return deleteAnnotation(ctx, call.input);
  }
}

/**
 * 应用一个待确认的补丁。
 * 三级保险的第二级：用户点了「接受」之后才走这里。
 */
export function applyPending(ctx: ToolContext, call: CanvasToolCall): ToolResult {
  switch (call.name) {
    case "updateNode":
      return updateNode(ctx, call.input, { force: true });
    case "moveNode":
      return moveNode(ctx, call.input, { force: true });
    case "deleteNode":
      return deleteNode(ctx, call.input, { force: true });
    case "updateAnnotation":
      return updateAnnotation(ctx, call.input, { force: true });
    case "deleteAnnotation":
      return deleteAnnotation(ctx, call.input, { force: true });
    default:
      // 其它工具本来就不需要确认
      return executeTool(ctx, call);
  }
}

// ---------------------------------------------------------------------------
// 实现
// ---------------------------------------------------------------------------

const done = (
  message: string,
  risk: RiskLevel,
  actions: Action[] = [],
): ToolResult => ({ ok: true, risk, applied: true, message, actions });

const fail = (message: string, risk: RiskLevel = "add"): ToolResult => ({
  ok: false,
  risk,
  applied: false,
  message,
  actions: [],
});

const hold = (call: CanvasToolCall, reason: string, risk: RiskLevel): ToolResult => ({
  ok: true,
  risk,
  applied: false,
  message: `需要你确认：${reason}`,
  actions: [],
  pending: { call, reason },
});

/**
 * 按需加载资产（ADR-0014 §5）：检索知识库字典，命中就引用而非新建。
 * 检索字段：标题 / 摘要 / tags / 类型；回收站资产不命中。
 */
function loadAsset(ctx: ToolContext, input: LoadAssetInput): ToolResult {
  const query = (input.query ?? "").trim().toLowerCase();
  const limit = Math.max(1, Math.min(12, input.limit ?? 6));
  const kinds = new Set(input.kinds ?? []);
  const scored: Array<{ score: number; node: KnowledgeNode }> = [];

  for (const node of getNodes(ctx.doc).values()) {
    if (node.trashedAt) continue; // 回收站资产不参与加载
    if (kinds.size > 0 && !kinds.has(node.kind)) continue;
    const haystack = [node.title, node.summary ?? "", node.kind, ...(node.tags ?? [])]
      .join(" ")
      .toLowerCase();
    if (!query) {
      scored.push({ score: 0, node });
      continue;
    }
    let score = 0;
    if (node.title.toLowerCase() === query) score = 3;
    else if (node.title.toLowerCase().includes(query)) score = 2;
    else if (haystack.includes(query)) score = 1;
    if (score > 0) scored.push({ score, node });
  }

  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, limit);
  const assets = top.map(({ node }) => {
    const rawStyle = node.meta?.["style"];
    return {
      id: node.id,
      kind: node.kind,
      title: node.title,
      summary: node.summary ?? "",
      tags: node.tags ?? [],
      shape: typeof node.meta?.["shape"] === "string" ? node.meta["shape"] : undefined,
      style: typeof rawStyle === "object" && rawStyle !== null ? rawStyle : undefined,
      relations: node.relations.map((r) => ({ to: r.to, kind: r.kind, label: r.label })),
    };
  });

  if (assets.length === 0) {
    return done(`字典里没有「${input.query}」相关的资产。需要的话用 spawnNode 新建一个（AI 初稿，人在资产卡审改）。`, "add");
  }
  return done(
    `知识库命中 ${assets.length} 个资产：${JSON.stringify(assets)}` +
      `\n优先复用已有资产的 id（spawnNode 用同 id，解释/形态/关系全部继承）；只有命名不一致时才新建。`,
    "add",
  );
}

function spawnNode(ctx: ToolContext, input: SpawnNodeInput): ToolResult {
  if (!input.id?.trim()) return fail("spawnNode 需要非空 id");
  if (!input.title?.trim()) return fail("spawnNode 需要非空 title");
  if (!Array.isArray(input.at) || input.at.length !== 2) return fail("spawnNode 需要 at:[x,y]");

  const existing = readNode(ctx.doc, input.id);
  const node: KnowledgeNode = {
    ...existing,
    id: input.id,
    kind: input.kind,
    title: input.title,
    summary: input.summary,
    relations: existing?.relations ?? [],
    ...(input.shape ? { meta: { ...(existing?.meta ?? {}), shape: input.shape } } : {}),
    // AI 新增的标 ai；如果人已经改过，保留人的标记
    provenance: isHumanOwned(existing) ? existing!.provenance : { origin: "ai", at: Date.now() },
  };
  upsertNode(ctx.doc, node);

  // 关键：把坐标写进 layout。只产出动画动作是不够的，
  // 否则画布会回退到默认位置 (0,0)，新节点堆在原点。
  setLayoutPosition(ctx.doc, input.id, input.at[0], input.at[1]);

  return done(`已生成节点「${input.title}」`, "add", [
    { t: ctx.t, kind: "node.spawn", nodeId: input.id, at: input.at },
  ]);
}

function updateNode(
  ctx: ToolContext,
  input: UpdateNodeInput,
  opts: { force?: boolean } = {},
): ToolResult {
  const node = readNode(ctx.doc, input.id);
  if (!node) return fail(`节点不存在：${input.id}`, "mutate");

  if (isHumanOwned(node) && !opts.force) {
    return hold({ name: "updateNode", input }, `「${node.title}」是你改过的，要覆盖吗？`, "mutate");
  }

  upsertNode(ctx.doc, {
    ...node,
    title: input.title ?? node.title,
    summary: input.summary ?? node.summary,
    kind: input.kind ?? node.kind,
    ...(input.shape ? { meta: { ...(node.meta ?? {}), shape: input.shape } } : {}),
    provenance: { origin: "ai", at: Date.now() },
  });

  return done(`已更新节点「${input.title ?? node.title}」`, "mutate");
}

function moveNode(
  ctx: ToolContext,
  input: MoveNodeInput,
  opts: { force?: boolean } = {},
): ToolResult {
  const node = readNode(ctx.doc, input.id);
  if (!node) return fail(`节点不存在：${input.id}`, "mutate");
  if (typeof input.x !== "number" || typeof input.y !== "number") {
    return fail("moveNode 需要数值 x/y", "mutate");
  }

  if (isHumanOwned(node) && !opts.force) {
    return hold({ name: "moveNode", input }, `「${node.title}」的位置是你调的，要挪动吗？`, "mutate");
  }

  setLayoutPosition(ctx.doc, input.id, input.x, input.y);
  return done(`已移动「${node.title}」`, "mutate");
}

function deleteNode(
  ctx: ToolContext,
  input: DeleteNodeInput,
  opts: { force?: boolean } = {},
): ToolResult {
  const node = readNode(ctx.doc, input.id);
  if (!node) return fail(`节点不存在：${input.id}`, "destructive");

  // 权限边界：不删人加的元素，除非用户明确要求（force）
  if (isHumanOwned(node) && !opts.force) {
    return hold({ name: "deleteNode", input }, `「${node.title}」是你创建的，确定要删吗？`, "destructive");
  }

  const survivors = [...getNodes(ctx.doc).entries()].filter(([id]) => id !== input.id);

  ctx.doc.transact(() => {
    removeNode(ctx.doc, input.id);
    // 清掉指向它的关系，避免留下悬空引用
    for (const [id, other] of survivors) {
      const kept = other.relations.filter((r) => r.to !== input.id);
      if (kept.length !== other.relations.length) {
        getNodes(ctx.doc).set(id, { ...other, relations: kept });
      }
    }
  });

  return done(`已删除「${node.title}」`, "destructive", [
    { t: ctx.t, kind: "node.remove", nodeId: input.id },
  ]);
}

function connect(ctx: ToolContext, input: ConnectInput): ToolResult {
  if (input.from === input.to) return fail("connect 不能自连");

  const from = readNode(ctx.doc, input.from);
  const to = readNode(ctx.doc, input.to);
  if (!from) return fail(`源节点不存在：${input.from}`);
  if (!to) return fail(`目标节点不存在：${input.to}`);

  const relationId = `r-${input.from}-${input.to}-${input.kind}`;
  if (!from.relations.some((r) => r.id === relationId)) {
    upsertNode(ctx.doc, {
      ...from,
      relations: [
        ...from.relations,
        { id: relationId, to: input.to, kind: input.kind, label: input.label },
      ],
    });
  }

  return done(`已连接 ${input.from} → ${input.to}`, "add", [
    { t: ctx.t, kind: "edge.connect", from: input.from, to: input.to, label: input.label },
  ]);
}

function disconnect(ctx: ToolContext, input: DisconnectInput): ToolResult {
  const from = readNode(ctx.doc, input.from);
  if (!from) return fail(`节点不存在：${input.from}`, "mutate");

  const kept = from.relations.filter((r) => r.to !== input.to);
  if (kept.length === from.relations.length) {
    return fail(`${input.from} 到 ${input.to} 之间没有关系`, "mutate");
  }

  upsertNode(ctx.doc, { ...from, relations: kept });
  return done(`已断开 ${input.from} → ${input.to}`, "mutate");
}

function setStyle(ctx: ToolContext, input: SetStyleInput): ToolResult {
  const node = readNode(ctx.doc, input.id);
  if (!node) return fail(`节点不存在：${input.id}`, "mutate");
  if (isHumanOwned(node)) {
    return hold({ name: "setStyle", input }, `「${node.title}」的样式是你调过的，要覆盖吗？`, "mutate");
  }

  upsertNode(ctx.doc, {
    ...node,
    meta: { ...node.meta, style: { ...(node.meta?.["style"] as object), ...input.style } },
    provenance: { origin: "ai", at: Date.now() },
  });
  return done(`已更新「${node.title}」的样式`, "mutate");
}

function flow(ctx: ToolContext, input: FlowInput): ToolResult {
  if (!readNode(ctx.doc, input.from) || !readNode(ctx.doc, input.to)) {
    return fail("flow 的两个端点必须都存在");
  }
  return done(`数据从 ${input.from} 流向 ${input.to}`, "add", [
    { t: ctx.t, kind: "flow.send", from: input.from, to: input.to, label: input.label },
  ]);
}

function focus(ctx: ToolContext, input: FocusInput): ToolResult {
  if (!readNode(ctx.doc, input.nodeId)) return fail(`节点不存在：${input.nodeId}`);
  return done(`聚焦 ${input.nodeId}`, "add", [
    { t: ctx.t, kind: "node.focus", nodeId: input.nodeId },
    { t: ctx.t, kind: "mascot.moveTo", nodeId: input.nodeId, state: "run" },
  ]);
}

function narrate(ctx: ToolContext, input: NarrateInput): ToolResult {
  if (!input.text?.trim()) return fail("narrate 需要非空 text");
  if (input.nodeId && !readNode(ctx.doc, input.nodeId)) {
    return fail(`节点不存在：${input.nodeId}`);
  }
  return done(`旁白：${input.text}`, "add", [
    { t: ctx.t, kind: "mascot.say", text: input.text },
  ]);
}

/** 手绘强调：给节点画圈/框/下划线/叉/高亮，让讲解“当场圈重点” */
function emphasize(ctx: ToolContext, input: EmphasizeInput): ToolResult {
  const node = readNode(ctx.doc, input.nodeId);
  if (!node) return fail(`节点不存在：${input.nodeId}`);
  const style: EmphasisStyle = EMPHASIS_STYLES.includes(input.style) ? input.style : "circle";
  return done(`强调「${node.title}」`, "add", [
    { t: ctx.t, kind: "emphasize", nodeId: input.nodeId, style, text: input.text },
  ]);
}

// ---------------------------------------------------------------------------
// Annotation 类工具（PRD/知识模型.md §2.3）
// ---------------------------------------------------------------------------

let annotationSeq = 0;

function nextAnnotationId(): string {
  annotationSeq += 1;
  return `anno-${Date.now().toString(36)}-${annotationSeq}`;
}

const isHumanAnnotation = (annotation: Annotation): boolean =>
  annotation.provenance?.origin === "human";

function annotate(ctx: ToolContext, input: AnnotateInput): ToolResult {
  if (!input.element || typeof input.element !== "object") {
    return fail("annotate 需要 element");
  }
  const { x, y, width, height } = input.element;
  if ([x, y, width, height].some((value) => typeof value !== "number")) {
    return fail("annotate 的 element 需要数值 x/y/width/height");
  }
  if (input.attachedTo && !readNode(ctx.doc, input.attachedTo)) {
    return fail(`要挂的节点不存在：${input.attachedTo}`);
  }

  const id = input.id?.trim() || nextAnnotationId();
  upsertAnnotation(ctx.doc, {
    id,
    type: input.type,
    ...(ctx.canvasId ? { canvasId: ctx.canvasId } : {}),
    ...(input.attachedTo ? { attachedTo: input.attachedTo } : {}),
    element: input.element,
    ...(input.text ? { text: input.text } : {}),
    provenance: { origin: "ai", at: Date.now() },
  });

  return done(input.text ? `已添加便签「${input.text}」` : "已添加标注", "add");
}

function updateAnnotation(
  ctx: ToolContext,
  input: UpdateAnnotationInput,
  opts: { force?: boolean } = {},
): ToolResult {
  const existing = readAnnotation(ctx.doc, input.id);
  if (!existing) return fail(`注释不存在：${input.id}`, "mutate");

  if (isHumanAnnotation(existing) && !opts.force) {
    return hold({ name: "updateAnnotation", input }, "这条标注是你画的，要改吗？", "mutate");
  }

  upsertAnnotation(ctx.doc, {
    ...existing,
    ...(input.text !== undefined ? { text: input.text } : {}),
    element: input.element ? { ...existing.element, ...input.element } : existing.element,
    provenance: { origin: "ai", at: Date.now() },
  });

  return done("已更新标注", "mutate");
}

function deleteAnnotation(
  ctx: ToolContext,
  input: DeleteAnnotationInput,
  opts: { force?: boolean } = {},
): ToolResult {
  const existing = readAnnotation(ctx.doc, input.id);
  if (!existing) return fail(`注释不存在：${input.id}`, "destructive");

  // 权限边界：不删人画的标注，除非用户明确要求
  if (isHumanAnnotation(existing) && !opts.force) {
    return hold({ name: "deleteAnnotation", input }, "这条标注是你画的，要删吗？", "destructive");
  }

  removeAnnotation(ctx.doc, input.id);
  return done("已删除标注", "destructive");
}

/** 把一批工具调用的风险汇总，供 UI 决定是否要弹确认 */export function summarizeRisk(results: ToolResult[]): RiskLevel {
  if (results.some((r) => r.risk === "destructive" && !r.applied)) return "destructive";
  if (results.some((r) => r.risk === "mutate" && !r.applied)) return "mutate";
  return "add";
}
