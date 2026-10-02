/**
 * 数据流粒子 —— 3Blue1Brown 的「数据穿过系统」
 *
 * `sampleAt()` 早就把 flows（from / to / progress）算出来了，但一直没人画：
 * 主画布是静态的，只有宠物、字幕、聚光灯在动。这一层把数据流补上。
 *
 * 实现：一层 SVG 覆盖层。每帧取 snapshot.flows，用 nodeOverlayRect() 拿到两端节点的
 * 容器坐标，按 progress 插值出「数据包」位置，画一条拖尾 + 一个发光点。
 *
 * 为什么用覆盖层而不是往 maxGraph 里塞动画 cell：
 *   与聚光灯同理 —— 每帧改 cell 会和 render() 的增量同步打架、还进 undo 栈。
 *   覆盖层是纯表现，零副作用，跟随视口即可。
 */
import { useEffect, useRef } from "react";
import { getPlayerState, subscribePlayer } from "../state/player";
import { nodeOverlayRect } from "./geometry";

const NS = "http://www.w3.org/2000/svg";

function svgEl<K extends keyof SVGElementTagNameMap>(name: K): SVGElementTagNameMap[K] {
  return document.createElementNS(NS, name);
}

export function FlowOverlay({ enabled = true }: { enabled?: boolean }) {
  const ref = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    return subscribePlayer(() => {
      const svg = ref.current;
      if (!svg) return;

      const state = getPlayerState();
      const flows = state.snapshot?.flows ?? [];
      // 演出没开始不打扰；播完就撒（和聚光灯一致，避免残留）
      const active = enabled && Boolean(state.script) && (state.playing || state.t > 0);

      while (svg.firstChild) svg.removeChild(svg.firstChild);
      if (!active || flows.length === 0) return;

      for (const flow of flows) {
        const from = nodeOverlayRect(flow.from);
        const to = nodeOverlayRect(flow.to);
        if (!from || !to) continue;

        const x1 = from.left + from.width / 2;
        const y1 = from.top + from.height / 2;
        const x2 = to.left + to.width / 2;
        const y2 = to.top + to.height / 2;

        const p = flow.progress;
        const x = x1 + (x2 - x1) * p;
        const y = y1 + (y2 - y1) * p;
        // 两端淡入淡出，别硬生生冒出来 / 消失
        const fade = Math.min(1, Math.min(p, 1 - p) * 6);

        const tailP = Math.max(0, p - 0.12);
        const trail = svgEl("line");
        trail.setAttribute("x1", String(x1 + (x2 - x1) * tailP));
        trail.setAttribute("y1", String(y1 + (y2 - y1) * tailP));
        trail.setAttribute("x2", String(x));
        trail.setAttribute("y2", String(y));
        trail.setAttribute("class", "flow-trail");
        trail.setAttribute("opacity", String(0.55 * fade));
        svg.appendChild(trail);

        const halo = svgEl("circle");
        halo.setAttribute("cx", String(x));
        halo.setAttribute("cy", String(y));
        halo.setAttribute("r", "9");
        halo.setAttribute("class", "flow-halo");
        halo.setAttribute("opacity", String(0.3 * fade));
        svg.appendChild(halo);

        const dot = svgEl("circle");
        dot.setAttribute("cx", String(x));
        dot.setAttribute("cy", String(y));
        dot.setAttribute("r", "4");
        dot.setAttribute("class", "flow-dot");
        dot.setAttribute("opacity", String(fade));
        svg.appendChild(dot);
      }
    });
  }, [enabled]);

  return <svg ref={ref} className="flow-layer" aria-hidden="true" />;
}
