/**
 * 本轮改动清单（PRD/主界面.md §5.1「收尾：回复附本次改动清单，可点击定位」）
 *
 * AI 每轮可能改十几个地方，光看聊天里那几行 `⚙ 已生成…` 根本对不上画布。
 * 这里收成结构化的一条条：谁、干了什么、点一下就定位过去。
 *
 * 为什么单独一个 store 而不是塞进聊天消息的 metadata：
 * assistant-ui 的消息 metadata 要一路透传（adapter → runtime → UI），
 * 而这份清单天然是「本轮」的、随下一轮清空，独立存更简单也更准确。
 */
import { useSyncExternalStore } from "react";

export interface RoundChange {
  id: string;
  /** 工具名（spawnNode / updateNode / deleteNode …） */
  tool: string;
  /** 给用户看的一句话 */
  label: string;
  /** 可定位的节点 id */
  nodeId?: string;
  /** 是否因为「人改过」而被挂起等待确认 */
  pending?: boolean;
}

let changes: RoundChange[] = [];
const listeners = new Set<() => void>();
let seq = 0;

function emit(): void {
  for (const l of listeners) l();
}

export function startRoundChanges(): void {
  changes = [];
  emit();
}

export function pushRoundChange(change: Omit<RoundChange, "id">): void {
  changes = [...changes, { ...change, id: `chg-${(seq += 1)}` }];
  emit();
}

export function clearRoundChanges(): void {
  if (changes.length === 0) return;
  changes = [];
  emit();
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useRoundChanges(): RoundChange[] {
  return useSyncExternalStore(subscribe, () => changes, () => changes);
}
