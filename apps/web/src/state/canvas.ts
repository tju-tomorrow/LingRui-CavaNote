/**
 * 当前概念画布（active canvas）
 *
 * 画布视图显示哪张图由它决定：
 *   - 有 active canvas → 只显示该画布的节点（+ 它自己的布局）
 *   - 没有 → 回落到「全局那张图」（旧行为，零迁移）
 *
 * 持久化到 localStorage，刷新后保持。
 */
import { useSyncExternalStore } from "react";

const KEY = "lingrui-active-canvas";

function load(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

let active: string | null = load();
const listeners = new Set<() => void>();

export function getActiveCanvas(): string | null {
  return active;
}

export function setActiveCanvas(id: string | null): void {
  if (id === active) return;
  active = id;
  try {
    if (id) localStorage.setItem(KEY, id);
    else localStorage.removeItem(KEY);
  } catch {
    /* 隐私模式：忽略 */
  }
  for (const l of listeners) l();
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useActiveCanvas(): string | null {
  return useSyncExternalStore(subscribe, getActiveCanvas, () => null);
}
