/**
 * 分镜缩略图条（见 PRD/演出层.md §4）
 *
 * 每个分镜 = 一章；缩略图由 `sampleAt(script, shot.startT)` 现场画成 mini SVG
 * （节点矩形 + 连线，坐标归一化）。点击 = seek 到该章起点。
 */
import { useEffect, useMemo, useState } from "react";
import { sampleAt, shotAt, type SceneScript, type Shot } from "@lingrui/anim";
import { formatTime, player, usePlayer } from "../state/player";
import { useKnowledgeChapters } from "../collab/useKnowledge";
import { useActiveCanvas } from "../state/canvas";
import { captureThumb, clearThumbs, subscribeThumbs, thumbOf } from "./thumbs";

const W = 88;
const H = 48;
const PAD = 8;

function MiniShot({ script, t }: { script: SceneScript; t: number }) {
  const s = sampleAt(script, t);
  const nodes = [...s.nodes.values()];
  const xs = nodes.map((n) => n.at[0]);
  const ys = nodes.map((n) => n.at[1]);
  const minX = Math.min(...xs, 0);
  const maxX = Math.max(...xs, 0);
  const minY = Math.min(...ys, 0);
  const maxY = Math.max(...ys, 0);
  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;
  const px = (x: number) => PAD + ((x - minX) / spanX) * (W - 2 * PAD);
  const py = (y: number) => PAD + ((y - minY) / spanY) * (H - 2 * PAD);

  const at = new Map(nodes.map((n) => [n.nodeId, [px(n.at[0]), py(n.at[1])] as const]));

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="tl-shot-svg" aria-hidden>
      {[...s.edges.values()].map((e) => {
        const a = at.get(e.from);
        const b = at.get(e.to);
        if (!a || !b) return null;
        return <line key={`${e.from}-${e.to}`} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="#c7d2fe" strokeWidth={1} />;
      })}
      {nodes.map((n) => {
        const p = at.get(n.nodeId);
        if (!p) return null;
        return (
          <rect
            key={n.nodeId}
            x={p[0] - 6}
            y={p[1] - 3.5}
            width={12}
            height={7}
            rx={2}
            fill={n.appear >= 1 ? "#f4f4f5" : "#f5f5f5"}
            stroke="#18181b"
            strokeWidth={0.8}
          />
        );
      })}
    </svg>
  );
}

export function ShotStrip() {
  const { script, chapters: memory, t } = usePlayer();
  // 优先 Y.Doc 里的分镜（可被人工编辑、可持久化）；还没落过盘时退回内存推导。
  // Chapter.startT 是可选的，这里归一成 Shot（startT 必填）给 shotAt / seek 用。
  const persisted = useKnowledgeChapters(useActiveCanvas());
  const chapters: Shot[] = useMemo(() => {
    const src = persisted.length > 0 ? persisted : memory;
    // 去重：多轮 AI 推导可能落下重复 id → 渲染重复 key → React 报错刷屏
    const seen = new Set<string>();
    const out: Shot[] = [];
    for (const c of src) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      out.push({ id: c.id, title: c.title, startT: c.startT ?? 0 });
    }
    return out;
  }, [persisted, memory]);

  const current = script ? shotAt(chapters, t) : undefined;

  // 缩略图：播到/拖到某个分镜时截一张真图（懒截图，见 thumbs.ts）
  const [, bump] = useState(0);
  useEffect(() => subscribeThumbs(() => bump((n) => n + 1)), []);
  useEffect(() => clearThumbs(), [chapters]);
  useEffect(() => {
    if (!current) return;
    // 等一帧：让画布先把这一帧的动画状态画完，截出来才是「首帧」
    const raf = requestAnimationFrame(() => void captureThumb(current.id));
    return () => cancelAnimationFrame(raf);
  }, [current?.id]);

  if (!script || chapters.length === 0) return null;

  return (
    <div className="tl-shots">
      {chapters.map((c, i) => {
        const thumb = thumbOf(c.id);
        return (
          <button
            key={`${c.id}-${i}`}
            type="button"
            className={`tl-shot${current?.id === c.id ? " active" : ""}`}
            onClick={() => player.seek(c.startT)}
            title={`跳到「${c.title}」`}
          >
            {/* 看过的分镜用真实画布截图；没看过的退回 SVG 迷你示意图 */}
            {thumb ? (
              <img className="tl-shot-thumb" src={thumb} alt="" />
            ) : (
              <MiniShot script={script} t={c.startT} />
            )}
            <span className="tl-shot-title">
              {i + 1}. {c.title}
            </span>
            <span className="tl-shot-time">{formatTime(c.startT)}</span>
          </button>
        );
      })}
    </div>
  );
}
