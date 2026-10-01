/**
 * 当前左侧导航视图（PRD/主界面.md §2.2）
 *
 * 提到 store 而不是留在 App 的 useState：因为「知识库 / 标签」里点一个条目
 * 要能跳回笔记视图并聚焦，跨组件触发，用 store 最省事（与 state/focus 同构）。
 */
import { useSyncExternalStore } from "react";

export type ShellView = "notes" | "knowledge" | "projects" | "tags" | "settings";

let view: ShellView = "notes";
const listeners = new Set<() => void>();

export function setView(next: ShellView): void {
  if (view === next) return;
  view = next;
  for (const l of listeners) l();
}

export function getView(): ShellView {
  return view;
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useView(): ShellView {
  return useSyncExternalStore(subscribe, getView, () => "notes" as ShellView);
}
