/**
 * 知识层撤销（ADR-0011 决策 5「三级保险」的第三级）
 *
 * 为什么用 Y.UndoManager 而不是 Excalidraw 的 undo：
 *   - 同一份 Y.Doc 同时承载 Knowledge / layout / Annotation，
 *     用 Excalidraw 的 undo 只能回退画布，回退不了「知识」本身。
 *   - Y.UndoManager 天然跨视图：撤销后文档视图和画布视图一起回退。
 *
 * 「一轮 AI 的全部改动 = 一个批次」靠 `stopCapturing()` 实现：
 * 每轮开始前切一刀，之后这一轮的所有 Y.Doc 写入就归为同一个 stack item。
 */
import { useSyncExternalStore } from "react";
import * as Y from "yjs";
import { getAnnotations, getLayout, getNodes, getNotes, getOrder } from "@lingrui/knowledge";
import { ydoc } from "../collab/doc";

/**
 * 撤销范围：知识节点 / 顺序 / 布局 / 注释 / **笔记树**。
 *
 * 为什么不含 BlockNote 的正文 fragment：它自带一套 yUndo，纳进来会双重撤销。
 * 为什么要把 notes 加进来：新建笔记、删分组也是用户动作，应该能 ⌘Z 撤回 ——
 * 否则同一套交互两套行为（改画布能撤、动笔记不能）。
 */
const undoManager = new Y.UndoManager(
  [getNodes(ydoc), getOrder(ydoc), getLayout(ydoc), getAnnotations(ydoc), getNotes(ydoc)],
  // 合并窗口内的连续小改动，避免一次拖动产生几十步
  { captureTimeout: 400 },
);

export interface UndoState {
  canUndo: boolean;
  canRedo: boolean;
}

const EMPTY: UndoState = { canUndo: false, canRedo: false };
let snapshot: UndoState = EMPTY;
const listeners = new Set<() => void>();

function refresh(): void {
  const next: UndoState = {
    canUndo: undoManager.undoStack.length > 0,
    canRedo: undoManager.redoStack.length > 0,
  };
  if (next.canUndo === snapshot.canUndo && next.canRedo === snapshot.canRedo) return;
  snapshot = next;
  for (const listener of listeners) listener();
}

undoManager.on("stack-item-added", refresh);
undoManager.on("stack-item-popped", refresh);
undoManager.on("stack-cleared", refresh);

/** 每轮 AI 交互开始前调用：把之后的写入切成新的一个批次 */
export function beginRound(): void {
  undoManager.stopCapturing();
}

/** 撤销一整轮 AI 改动（跨文档与画布） */
export function undoRound(): boolean {
  if (undoManager.undoStack.length === 0) return false;
  undoManager.undo();
  return true;
}

export function redoRound(): boolean {
  if (undoManager.redoStack.length === 0) return false;
  undoManager.redo();
  return true;
}

function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

export function useUndoState(): UndoState {
  return useSyncExternalStore(subscribe, () => snapshot, () => EMPTY);
}
