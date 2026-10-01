/**
 * Canvas 工具执行器 —— AI（或本地 planner）真正修改画布的地方
 *
 * 设计原则：
 *   1. 工具只通过 `@lingrui/knowledge` 改 Y.Doc，不直接碰画布。画布是派生的（ADR-0009）。
 *   2. 每次调用同时产出一段 `@lingrui/anim` 的 SceneScript 动作，
 *      这样"落盘"和"演出"用的是同一条动作流。
 *   3. 纯函数式输入输出，不依赖 React / 浏览器，可直接单测。
 */
import type * as Y from "yjs";
import {
  readNode,
  upsertNode,
  type KnowledgeNode,
  type NodeKind,
  type RelationKind,
} from "@lingrui/knowledge";
import type { Action } from "@lingrui/anim";

export interface SpawnNodeInput {
  id: string;
  kind: NodeKind;
  title: string;
  summary?: string;
  at: [number, number];
}

export interface ConnectInput {
  from: string;
  to: string;
  kind: RelationKind;
  label?: string;
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
  | { name: "connect"; input: ConnectInput }
  | { name: "flow"; input: FlowInput }
  | { name: "focus"; input: FocusInput }
  | { name: "narrate"; input: NarrateInput };

export interface ToolContext {
  doc: Y.Doc;
  /** 当前时间轴位置（秒），用于给产出的动作打时间戳 */
  t: number;
}

export interface ToolResult {
  ok: boolean;
  message: string;
  actions: Action[];
}

const fail = (message: string): ToolResult => ({ ok: false, message, actions: [] });

export function executeTool(ctx: ToolContext, call: CanvasToolCall): ToolResult {
  switch (call.name) {
    case "spawnNode":
      return spawnNode(ctx, call.input);
    case "connect":
      return connect(ctx, call.input);
    case "flow":
      return flow(ctx, call.input);
    case "focus":
      return focus(ctx, call.input);
    case "narrate":
      return narrate(ctx, call.input);
  }
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
  };
  upsertNode(ctx.doc, node);

  return {
    ok: true,
    message: `已生成节点「${input.title}」`,
    actions: [{ t: ctx.t, kind: "node.spawn", nodeId: input.id, at: input.at }],
  };
}

function connect(ctx: ToolContext, input: ConnectInput): ToolResult {
  if (input.from === input.to) return fail("connect 不能自连");

  const from = readNode(ctx.doc, input.from);
  const to = readNode(ctx.doc, input.to);
  if (!from) return fail(`源节点不存在：${input.from}`);
  if (!to) return fail(`目标节点不存在：${input.to}`);

  const relationId = `r-${input.from}-${input.to}-${input.kind}`;
  const already = from.relations.some((r) => r.id === relationId);
  if (!already) {
    upsertNode(ctx.doc, {
      ...from,
      relations: [...from.relations, { id: relationId, to: input.to, kind: input.kind, label: input.label }],
    });
  }

  return {
    ok: true,
    message: `已连接 ${input.from} → ${input.to}`,
    actions: [{ t: ctx.t, kind: "edge.connect", from: input.from, to: input.to, label: input.label }],
  };
}

function flow(ctx: ToolContext, input: FlowInput): ToolResult {
  if (!readNode(ctx.doc, input.from) || !readNode(ctx.doc, input.to)) {
    return fail("flow 的两个端点必须都存在");
  }
  return {
    ok: true,
    message: `数据从 ${input.from} 流向 ${input.to}`,
    actions: [{ t: ctx.t, kind: "flow.send", from: input.from, to: input.to, label: input.label }],
  };
}

function focus(ctx: ToolContext, input: FocusInput): ToolResult {
  if (!readNode(ctx.doc, input.nodeId)) return fail(`节点不存在：${input.nodeId}`);
  return {
    ok: true,
    message: `聚焦 ${input.nodeId}`,
    actions: [
      { t: ctx.t, kind: "node.focus", nodeId: input.nodeId },
      { t: ctx.t, kind: "mascot.moveTo", nodeId: input.nodeId, state: "run" },
    ],
  };
}

function narrate(ctx: ToolContext, input: NarrateInput): ToolResult {
  if (!input.text?.trim()) return fail("narrate 需要非空 text");
  if (input.nodeId && !readNode(ctx.doc, input.nodeId)) {
    return fail(`节点不存在：${input.nodeId}`);
  }
  return {
    ok: true,
    message: `旁白：${input.text}`,
    actions: [{ t: ctx.t, kind: "mascot.say", text: input.text }],
  };
}
