/**
 * 画布几何 —— 场景坐标 ↔ 覆盖层坐标（ADR-0013：改用 maxGraph 引擎）
 *
 * 换算逻辑收在引擎里（`GraphEngine.sceneToContainer` / `nodeRect`），
 * 这里只做覆盖层需要的矩形封装。抄错一次就是「框跑到画布外面」，所以只此一份。
 */
import { getCanvas } from "./bridge";

export interface OverlayRect {
  left: number;
  top: number;
  width: number;
  height: number;
  /** 右/下边到画布容器的距离，用于判断该往哪边放 */
  right: number;
  bottom: number;
}

/** 节点在覆盖层坐标系里的矩形（不可见/不存在时返回 null） */
export function nodeOverlayRect(nodeId: string): OverlayRect | null {
  const engine = getCanvas();
  if (!engine) return null;

  const rect = engine.nodeRect(nodeId);
  if (!rect) return null;

  const viewport = engine.viewport();
  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
    right: viewport.width - (rect.left + rect.width),
    bottom: viewport.height - (rect.top + rect.height),
  };
}

/** 覆盖层容器的尺寸（= 画布可视区） */
export function canvasViewportSize(): { width: number; height: number } {
  const engine = getCanvas();
  if (!engine) return { width: 0, height: 0 };
  const { width, height } = engine.viewport();
  return { width, height };
}
