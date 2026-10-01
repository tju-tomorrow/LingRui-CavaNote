/**
 * 当前聚焦的 KnowledgeNode。
 *
 * 画布点击 → setFocus → 聊天面板读取。
 * 这就是产品里"点击任意节点，追问该节点的具体知识"的最小闭环。
 */
import { useSyncExternalStore } from "react";

let focused: string | null = null;
const listeners = new Set<() => void>();

export function setFocus(nodeId: string | null): void {
  if (focused === nodeId) return;
  focused = nodeId;
  for (const l of listeners) l();
}

export function getFocus(): string | null {
  return focused;
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useFocus(): string | null {
  return useSyncExternalStore(subscribe, getFocus, () => null);
}
