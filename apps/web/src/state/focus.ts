/**
 * 当前聚焦的 KnowledgeNode。
 *
 * 画布点击 → setFocus → 聊天面板读取。
 * 这就是产品里"点击任意节点，追问该节点的具体知识"的最小闭环。
 */
import { useSyncExternalStore } from "react";
import { setCanvasOpen } from "./layout";

let focused: string | null = null;
const listeners = new Set<() => void>();

export function setFocus(nodeId: string | null): void {
  // 「聚焦某个节点」永远意味着「我要在画布上看它」：收起状态顺手展开，
  // 否则点了没反应。放在这里而不是调用点，是因为重复点同一个节点时
  // 下游也要能重新把画布叫出来（下面 focused === nodeId 会提前 return）。
  if (nodeId) setCanvasOpen(true);
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
