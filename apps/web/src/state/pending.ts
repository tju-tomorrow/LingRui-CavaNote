/**
 * 待确认补丁（ADR-0011 决策 5「三级保险」的第二级）
 *
 * AI 想改/删「人改过」的元素时，executor 不会直接应用，而是返回 pending。
 * 这里把 pending 收集起来，交给 UI 做 ghost 预览 + 逐条/全部接受。
 */
import { useSyncExternalStore } from "react";
import type { CanvasToolCall, RiskLevel } from "@lingrui/ai";

export interface PendingPatch {
  id: string;
  call: CanvasToolCall;
  reason: string;
  risk: RiskLevel;
}

const EMPTY: PendingPatch[] = [];
let patches: PendingPatch[] = EMPTY;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

/** 稳定 key：同一个工具 + 同样的入参只留一条 */
export function patchId(call: CanvasToolCall): string {
  return `${call.name}:${JSON.stringify(call.input)}`;
}

export function pushPending(call: CanvasToolCall, reason: string, risk: RiskLevel): void {
  const id = patchId(call);
  if (patches.some((p) => p.id === id)) return;
  patches = [...patches, { id, call, reason, risk }];
  emit();
}

export function resolvePending(id: string): void {
  const next = patches.filter((p) => p.id !== id);
  if (next.length === patches.length) return;
  patches = next;
  emit();
}

export function clearPending(): void {
  if (patches.length === 0) return;
  patches = EMPTY;
  emit();
}

function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

export function usePendingPatches(): PendingPatch[] {
  return useSyncExternalStore(subscribe, () => patches, () => EMPTY);
}
