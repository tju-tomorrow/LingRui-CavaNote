/**
 * 版本快照 / 保存（PRD/导出与分发.md §2）
 *
 * 把「唯一真相」的快照（节点 + 布局 + 时间）存进 localStorage，保留最近 20 份。
 *
 * 分两类（之前不区分，自动快照会把手动存的挤掉）：
 *   - `manual`：用户按「保存」/⌘S 打的点，**永远保留**
 *   - `auto`：AI 每轮动手前自动打的点，用于「回到 AI 改之前」，只留最近 10 份
 */
import {
  getLayout,
  getNodes,
  getOrder,
  type KnowledgeNode,
} from "@lingrui/knowledge";
import { ydoc } from "../collab/doc";

const KEY = "lingrui-snapshots";
const MAX_MANUAL = 20;
const MAX_AUTO = 10;

export interface Snapshot {
  at: number;
  reason: "manual" | "auto";
  label?: string;
  nodes: KnowledgeNode[];
  layout: Record<string, { x: number; y: number }>;
}

function read(): Snapshot[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as Snapshot[]) : [];
    // 兼容老数据（没有 reason 字段的一律当手动）
    return parsed.map((s) => ({ ...s, reason: s.reason ?? "manual" }));
  } catch {
    return [];
  }
}

function write(all: Snapshot[]): void {
  const manual = all.filter((s) => s.reason === "manual").slice(0, MAX_MANUAL);
  const auto = all.filter((s) => s.reason === "auto").slice(0, MAX_AUTO);
  try {
    localStorage.setItem(KEY, JSON.stringify([...manual, ...auto].sort((a, b) => b.at - a.at)));
  } catch {
    /* 配额或隐私模式：忽略 */
  }
}

export function listSnapshots(): Snapshot[] {
  return read().sort((a, b) => b.at - a.at);
}

export function latestSnapshotAt(): number | null {
  return listSnapshots().find((s) => s.reason === "manual")?.at ?? null;
}

function capture(reason: Snapshot["reason"], label?: string): Snapshot {
  return {
    at: Date.now(),
    reason,
    ...(label ? { label } : {}),
    nodes: [...getNodes(ydoc).values()],
    layout: getLayout(ydoc).toJSON(),
  };
}

/** 手动打点（「保存」按钮 / ⌘S） */
export function saveSnapshot(label?: string): Snapshot {
  const snap = capture("manual", label);
  write([snap, ...read()]);
  return snap;
}

/** AI 动手前自动打点（用于「回到 AI 改之前」） */
export function autoSnapshot(label: string): void {
  write([capture("auto", label), ...read()]);
}

/**
 * 自动打点（带节流）。
 *
 * 一轮 AI 可能连着调十几个工具，每个都打点会把历史刷爆 ——
 * 所以 3 秒内只打一次，效果就是「一轮一个点」。
 */
let lastAutoAt = 0;
export function autoSnapshotThrottled(label: string, windowMs = 3000): void {
  const now = Date.now();
  if (now - lastAutoAt < windowMs) return;
  lastAutoAt = now;
  autoSnapshot(label);
}

export function removeSnapshot(at: number): void {
  write(read().filter((s) => s.at !== at));
}

/**
 * 恢复到某份快照。
 *
 * 节点 / 顺序 / 布局都在 undo 的作用域里（state/history.ts），
 * 所以「恢复」本身也能 ⌘Z 撤回来 —— 不会一键把当前工作弄丢。
 */
export function restoreSnapshot(snap: Snapshot): void {
  ydoc.transact(() => {
    const nodes = getNodes(ydoc);
    const keep = new Set(snap.nodes.map((n) => n.id));
    for (const id of [...nodes.keys()]) {
      if (!keep.has(id)) nodes.delete(id);
    }
    for (const node of snap.nodes) nodes.set(node.id, node);

    const order = getOrder(ydoc);
    order.delete(0, order.length);
    order.push(snap.nodes.map((n) => n.id));

    const layout = getLayout(ydoc);
    for (const id of [...layout.keys()]) layout.delete(id);
    for (const [id, at] of Object.entries(snap.layout)) layout.set(id, at);
  });
}
