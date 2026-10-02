/**
 * 画布引擎注册表 + 视口变化订阅（ADR-0013）
 *
 * 聊天面板要截屏回灌上下文、ghost 预览要按视口定位，但都拿不到画布实例。
 * 这里放一个极薄的注册表（同 editor/bridge.ts 的思路），避免把 maxGraph 的
 * imperative 引擎对象通过 props 一层层传下去。
 */
import { useSyncExternalStore } from "react";
import type { GraphEngine } from "@lingrui/canvas";

export type CanvasApi = GraphEngine;

let engine: CanvasApi | null = null;
let version = 0;
const listeners = new Set<() => void>();

export function registerCanvas(next: CanvasApi | null): void {
  engine = next;
  if (import.meta.env.DEV) {
    (window as unknown as Record<string, unknown>)["__canvas"] = next;
  }
  bumpCanvasVersion();
}

export function getCanvas(): CanvasApi | null {
  return engine;
}

/** 画布场景或视口变了（拖动、缩放、节点增删） */
export function bumpCanvasVersion(): void {
  version += 1;
  for (const listener of listeners) listener();
}

function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

export function useCanvasVersion(): number {
  return useSyncExternalStore(
    subscribe,
    () => version,
    () => 0,
  );
}
