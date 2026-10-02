/**
 * 画布几何 —— 场景坐标 ↔ 覆盖层坐标
 *
 * 为什么单独抽出来：这段换算（`sceneCoordsToViewportCoords` 返回的是**页面绝对**坐标，
 * 要减掉容器 offset 才是覆盖层能用的容器相对坐标）之前在三个覆盖层里各抄了一遍。
 * 抄错一次就是「框跑到画布外面」（实测踩过），所以收成一份。
 */
import { sceneCoordsToViewportCoords } from "@excalidraw/excalidraw";
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
  const api = getCanvas();
  if (!api) return null;

  const element = api.getSceneElements().find((el) => el.id === `el-${nodeId}`);
  if (!element) return null;

  const appState = api.getAppState();
  const offsetLeft = Number((appState as { offsetLeft?: number }).offsetLeft ?? 0);
  const offsetTop = Number((appState as { offsetTop?: number }).offsetTop ?? 0);

  const topLeft = sceneCoordsToViewportCoords({ sceneX: element.x, sceneY: element.y }, appState);
  const bottomRight = sceneCoordsToViewportCoords(
    { sceneX: element.x + element.width, sceneY: element.y + element.height },
    appState,
  );

  const left = topLeft.x - offsetLeft;
  const top = topLeft.y - offsetTop;

  return {
    left,
    top,
    width: bottomRight.x - topLeft.x,
    height: bottomRight.y - topLeft.y,
    right: appState.width - (bottomRight.x - offsetLeft),
    bottom: appState.height - (bottomRight.y - offsetTop),
  };
}

/** 覆盖层容器的尺寸（= 画布可视区） */
export function canvasViewportSize(): { width: number; height: number } {
  const api = getCanvas();
  if (!api) return { width: 0, height: 0 };
  const appState = api.getAppState();
  return { width: appState.width, height: appState.height };
}
