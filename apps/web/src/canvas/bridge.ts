/**
 * 画布 API 注册表
 *
 * 聊天面板要截屏回灌上下文，但拿不到画布组件实例。
 * 这里放一个极薄的注册表（同 editor/bridge.ts 的思路），
 * 避免把 Excalidraw 的 imperative API 通过 props 一层层传下去。
 */
import type { ComponentProps } from "react";
import type { Excalidraw } from "@excalidraw/excalidraw";

type ExcalidrawProps = ComponentProps<typeof Excalidraw>;
export type CanvasApi = NonNullable<
  Parameters<NonNullable<ExcalidrawProps["excalidrawAPI"]>>[0]
>;

let api: CanvasApi | null = null;

export function registerCanvas(next: CanvasApi | null): void {
  api = next;
}

export function getCanvas(): CanvasApi | null {
  return api;
}
