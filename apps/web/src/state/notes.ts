/**
 * 当前打开的笔记（PRD/主界面.md §2.3）
 *
 * 和 state/focus 同构：一个极小的外部 store + useSyncExternalStore。
 * 切换笔记时 NoteEditor 会**重建编辑器**（不同 fragment），这是刻意的——
 * BlockNote 的 collaboration fragment 在创建时绑定，换 fragment 只能重建。
 */
import { useSyncExternalStore } from "react";

let active: string | null = null;
const listeners = new Set<() => void>();

export function setActiveNote(id: string | null): void {
  if (active === id) return;
  active = id;
  for (const l of listeners) l();
}

export function getActiveNote(): string | null {
  return active;
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useActiveNote(): string | null {
  return useSyncExternalStore(subscribe, getActiveNote, () => null);
}
