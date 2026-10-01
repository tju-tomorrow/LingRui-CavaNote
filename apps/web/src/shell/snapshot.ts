/**
 * 版本快照 / 保存（PRD/导出与分发.md §2）
 *
 * P1.5 版：把「唯一真相」快照（节点 + 布局 + 时间）存进 localStorage，
 * 保留最近 20 份。自动保存已开；「保存」按钮 = 手动打一个命名时间点。
 */
import { getLayout, getNodes, type KnowledgeNode } from "@lingrui/knowledge";
import { ydoc } from "../collab/doc";

const KEY = "lingrui-snapshots";

export interface Snapshot {
  at: number;
  nodes: KnowledgeNode[];
  layout: Record<string, { x: number; y: number }>;
}

export function listSnapshots(): Snapshot[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Snapshot[]) : [];
  } catch {
    return [];
  }
}

export function latestSnapshotAt(): number | null {
  return listSnapshots()[0]?.at ?? null;
}

export function saveSnapshot(): Snapshot {
  const snap: Snapshot = {
    at: Date.now(),
    nodes: [...getNodes(ydoc).values()],
    layout: getLayout(ydoc).toJSON(),
  };
  try {
    localStorage.setItem(KEY, JSON.stringify([snap, ...listSnapshots()].slice(0, 20)));
  } catch {
    /* 配额或隐私模式：忽略，仍返回本次快照 */
  }
  return snap;
}
