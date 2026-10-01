/**
 * 画布布局
 *
 * 位置不是"知识"，但必须持久化 / 协同，所以存在同一个 Y.Doc 的 layout map 里，
 * 默认值来自 seed 里的 DEFAULT_LAYOUT。
 */
import { getLayout, setLayoutPosition } from "@lingrui/knowledge";
import { ydoc } from "./doc";
import { DEFAULT_LAYOUT, type NodeLayout } from "./seed";

/** 默认布局 + 用户拖动后的覆盖 */
export function layoutSnapshot(): NodeLayout {
  return { ...DEFAULT_LAYOUT, ...getLayout(ydoc).toJSON() };
}

export function setNodePosition(nodeId: string, x: number, y: number): void {
  setLayoutPosition(ydoc, nodeId, x, y);
}
