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
import { getCanvas, useCanvasVersion } from "./bridge";
import { nodeOverlayRect, type OverlayRect } from "./geometry";
import { usePlayer } from "../state/player";

export function SpotlightOverlay({ enabled = true }: { enabled?: boolean }) {
  const { snapshot, playing, script, t, duration } = usePlayer();
  const canvasVersion = useCanvasVersion();
  const [box, setBox] = useState<OverlayRect | null>(null);

  const focus = snapshot?.focus ?? null;
  // 演出没开始就不打扰；**放完就撒掉** —— 否则时间轴停在末尾时聚光灯会一直盖满画布，
  // 画布看起来就是"一片空白/灰蒙蒙"。
  const ended = duration > 0 && t >= duration - 0.01;
  const active =
    enabled && Boolean(script) && !ended && (playing || t > 0) && Boolean(focus);

  useEffect(() => {
    if (!active || !focus) {
      setBox(null);
      return;
    }
    // canvasVersion 变了（缩放/平移/元素变动）就重算
    const next = nodeOverlayRect(focus);
    setBox(next);
    if (next) return;

    // 元素还没出现（spawn 动画进行中）：下一帧再试
    const raf = requestAnimationFrame(() => setBox(nodeOverlayRect(focus)));
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
      const element = api.getSceneElements().find((el) => el.id === `el-${focus}`);
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
