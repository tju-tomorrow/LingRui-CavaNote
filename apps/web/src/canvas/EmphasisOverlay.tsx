/**
 * 手绘强调层（表现力 / 演出层）
 *
 * 讲解时“当场圈重点”：在节点上手绘一个圈 / 框 / 下划线 / 叉 / 荧光笔。
 * 由 `SceneScript` 的 `emphasize` 动作驱动，Agent 通过同名工具生成。
 *
 * 为什么手绘：干净的 maxGraph 图形 + 手绘批注，是「讲解视频」最出表现力的组合
 * （干净主体 + 人手批注）。用 vendored rough 的 npm 包（MIT）绘制。
 *
 * 覆盖层是纯表现，不进 maxGraph / 不进 undo；跟随视口即可。
 */
import { useEffect, useRef } from "react";
import rough from "roughjs";
import type { EmphasisStyle } from "@lingrui/anim";
import { getPlayerState, subscribePlayer } from "../state/player";
import { canvasViewportSize, nodeOverlayRect } from "./geometry";

const COLORS: Record<EmphasisStyle, string> = {
  circle: "#f59e0b",
  box: "#ef4444",
  underline: "#2563eb",
  cross: "#dc2626",
  highlight: "#fde047",
};

/** 稳定种子：让手绘笔触在每帧之间不抖 */
function seedOf(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h) % 100000;
}

export function EmphasisOverlay({ enabled = true }: { enabled?: boolean }) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const rc = rough.canvas(canvas);

    return subscribePlayer(() => {
      const state = getPlayerState();
      const { width, height } = canvasViewportSize();
      const dpr = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
      const pw = Math.max(1, Math.round(width * dpr));
      const ph = Math.max(1, Math.round(height * dpr));
      if (canvas.width !== pw || canvas.height !== ph) {
        canvas.width = pw;
        canvas.height = ph;
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      const active = enabled && Boolean(state.script) && (state.playing || state.t > 0);
      const emphases = state.snapshot?.emphases ?? [];
      if (!active || emphases.length === 0) return;

      for (const e of emphases) {
        const rect = nodeOverlayRect(e.nodeId);
        if (!rect) continue;

        const pad = 10;
        const x = rect.left - pad;
        const y = rect.top - pad;
        const w = rect.width + pad * 2;
        const h = rect.height + pad * 2;
        const grow = 0.86 + 0.14 * Math.max(0, Math.min(1, e.draw));
        const gw = w * grow;
        const gh = h * grow;
        const gx = x + (w - gw) / 2;
        const gy = y + (h - gh) / 2;
        const alpha = Math.max(0, Math.min(1, e.opacity)) * Math.max(0, Math.min(1, e.draw));
        const color = COLORS[e.style];
        const seed = seedOf(`${e.nodeId}:${e.style}`);
        ctx.globalAlpha = alpha;

        const base = { roughness: 1.5, stroke: color, strokeWidth: 2.6, seed };
        switch (e.style) {
          case "circle":
            rc.ellipse(gx + gw / 2, gy + gh / 2, gw + 16, gh + 16, base);
            break;
          case "box":
            rc.rectangle(gx, gy, gw, gh, base);
            break;
          case "underline":
            rc.line(x, y + h + 8, x + w, y + h + 8, { ...base, strokeWidth: 3.2 });
            break;
          case "cross":
            rc.line(gx, gy, gx + gw, gy + gh, { ...base, strokeWidth: 3 });
            rc.line(gx + gw, gy, gx, gy + gh, { ...base, strokeWidth: 3 });
            break;
          case "highlight":
            rc.rectangle(gx, gy + gh * 0.15, gw, gh * 0.85, {
              roughness: 1.2,
              seed,
              fill: color,
              fillStyle: "solid",
              fillWeight: 0.6,
              stroke: "none",
            });
            break;
        }
        ctx.globalAlpha = 1;
      }
    });
  }, [enabled]);

  return <canvas ref={ref} className="emphasis-layer" aria-hidden="true" />;
}
