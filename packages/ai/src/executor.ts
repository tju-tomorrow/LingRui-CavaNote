/**
 * Canvas 工具执行器 —— AI（或本地 planner）真正修改画布的地方
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
  readNode,
  removeNode,
  setLayoutPosition,
  upsertNode,
  type KnowledgeNode,
  type NodeKind,
  type RelationKind,
} from "@lingrui/knowledge";
import type { Action } from "@lingrui/anim";

// ---------------------------------------------------------------------------
// 入参
// ---------------------------------------------------------------------------

export interface SpawnNodeInput {
  id: string;
  kind: NodeKind;
  title: string;
  summary?: string;
  at: [number, number];
}

export interface UpdateNodeInput {
  id: string;
  title?: string;
  summary?: string;
  kind?: NodeKind;
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

export interface FocusInput {
  nodeId: string;
}

export interface NarrateInput {
  text: string;
  nodeId?: string;
}

export type CanvasToolCall =
  | { name: "spawnNode"; input: SpawnNodeInput }
  | { name: "updateNode"; input: UpdateNodeInput }
  | { name: "moveNode"; input: MoveNodeInput }
  | { name: "deleteNode"; input: DeleteNodeInput }
  | { name: "connect"; input: ConnectInput }
  | { name: "disconnect"; input: DisconnectInput }
  | { name: "setStyle"; input: SetStyleInput }
  | { name: "flow"; input: FlowInput }
  | { name: "focus"; input: FocusInput }
  | { name: "narrate"; input: NarrateInput };

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
    case "narrate":
      return narrate(ctx, call.input);
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
    // AI 新增的标 ai；如果人已经改过，保留人的标记
    provenance: isHumanOwned(existing) ? existing!.provenance : { origin: "ai", at: Date.now() },
  };
  upsertNode(ctx.doc, node);

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

/** 把一批工具调用的风险汇总，供 UI 决定是否要弹确认 */
export function summarizeRisk(results: ToolResult[]): RiskLevel {
  if (results.some((r) => r.risk === "destructive" && !r.applied)) return "destructive";
  if (results.some((r) => r.risk === "mutate" && !r.applied)) return "mutate";
  return "add";
}
