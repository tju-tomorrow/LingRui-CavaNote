/**
 * 演出聚光灯 —— 播放时把「正在讲的那个节点」照亮，其余压暗。
 *
 * 这是「讲解」变成「演出」的关键一步：没有它，观众得自己在十几个节点里找
 * 现在讲到哪了。PRD/演出层.md §3 的 seek 四联动里「画布」那一环，实际缺的就是它。
 *
 * 为什么用 DOM 覆盖层而不是改 Excalidraw 元素的 opacity：
 *   - 动元素 opacity 会和 diffScene 的同步打架（每帧改版本号 → 反复重绘、还进 undo 栈）
 *   - 覆盖层是纯表现，跟随缩放/平移即可，零副作用
 * 压暗用 `box-shadow: 0 0 0 9999px` 一个属性搞定，不用画四块遮罩。
 */
import { useEffect, useState } from "react";
import { sceneCoordsToViewportCoords } from "@excalidraw/excalidraw";
import { getCanvas, useCanvasVersion } from "./bridge";
import { usePlayer } from "../state/player";

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** 节点 id → 元素 id（与 excalidraw-binding 的约定一致） */
const elementIdOf = (nodeId: string): string => `el-${nodeId}`;

function boxOf(elementId: string): Box | null {
  const api = getCanvas();
  if (!api) return null;
  const element = api.getSceneElements().find((el) => el.id === elementId);
  if (!element) return null;

  const appState = api.getAppState();
  // sceneCoordsToViewportCoords 返回的是**页面绝对**坐标（含容器 offset），
  // 而覆盖层是容器相对定位 → 必须减掉，否则框会跑到画布外面。
  const offsetLeft = Number((appState as { offsetLeft?: number }).offsetLeft ?? 0);
  const offsetTop = Number((appState as { offsetTop?: number }).offsetTop ?? 0);

  const topLeft = sceneCoordsToViewportCoords({ sceneX: element.x, sceneY: element.y }, appState);
  const bottomRight = sceneCoordsToViewportCoords(
    { sceneX: element.x + element.width, sceneY: element.y + element.height },
    appState,
  );

  return {
    left: topLeft.x - offsetLeft,
    top: topLeft.y - offsetTop,
    width: bottomRight.x - topLeft.x,
    height: bottomRight.y - topLeft.y,
  };
}

export function SpotlightOverlay({ enabled = true }: { enabled?: boolean }) {
  const { snapshot, playing, script, t } = usePlayer();
  const canvasVersion = useCanvasVersion();
  const [box, setBox] = useState<Box | null>(null);

  const focus = snapshot?.focus ?? null;
  // 演出没开始就不打扰（t=0 且没在播时也不压暗）
  const active = enabled && Boolean(script) && (playing || t > 0) && Boolean(focus);

  useEffect(() => {
    if (!active || !focus) {
      setBox(null);
      return;
    }
    // canvasVersion 变了（缩放/平移/元素变动）就重算
    const next = boxOf(elementIdOf(focus));
    setBox(next);
    if (next) return;

    // 元素还没出现（spawn 动画进行中）：下一帧再试
    const raf = requestAnimationFrame(() => setBox(boxOf(elementIdOf(focus))));
    return () => cancelAnimationFrame(raf);
  }, [active, focus, canvasVersion]);

  /**
   * 镜头跟随：讲到一个新节点时把它带到视野中间。
   *
   * 不做这一步就会出现最尴尬的情况 —— 聚光灯压暗了全场，而「正在讲的那个」
   * 根本不在视野里（只能看到一片暗）。
   *
   * 只在 **focus 变化时** 跟随（不是每帧），所以用户在一个分镜内手动平移不会被抢。
   * `fitToContent: false` 是 pan-only：保持当前缩放，只居中。
   */
  useEffect(() => {
    if (!active || !focus) return;
    const api = getCanvas();
    if (!api) return;

    const raf = requestAnimationFrame(() => {
      const element = api.getSceneElements().find((el) => el.id === elementIdOf(focus));
      if (!element) return;
      api.scrollToContent([element], { fitToContent: false, animate: true });
    });
    return () => cancelAnimationFrame(raf);
  }, [active, focus]);

  if (!active || !box) return null;

  return (
    <div className="spotlight-layer" aria-hidden="true">
      <div
        className="spotlight-hole"
        style={{
          left: box.left - 10,
          top: box.top - 10,
          width: box.width + 20,
          height: box.height + 20,
        }}
      />
    </div>
  );
}
