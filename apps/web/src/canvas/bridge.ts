/**
 * 画布 API 注册表 + 视口变化订阅
 *
 * 聊天面板要截屏回灌上下文、ghost 预览要按视口定位，
 * 但都拿不到画布组件实例。这里放一个极薄的注册表
 * （同 editor/bridge.ts 的思路），避免把 Excalidraw 的
 * imperative API 通过 props 一层层传下去。
 */
import { useSyncExternalStore, type ComponentProps } from "react";
import type { Excalidraw } from "@excalidraw/excalidraw";

type ExcalidrawProps = ComponentProps<typeof Excalidraw>;
export type CanvasApi = NonNullable<
  Parameters<NonNullable<ExcalidrawProps["excalidrawAPI"]>>[0]
>;

let api: CanvasApi | null = null;
let version = 0;
const listeners = new Set<() => void>();

export function registerCanvas(next: CanvasApi | null): void {
  api = next;
  bumpCanvasVersion();
}

export function getCanvas(): CanvasApi | null {
  return api;
}

/** 画布场景或视口变了（拖动、缩放、元素增删）——由 CanvasStage 的 onChange 调用 */
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
