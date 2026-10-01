/**
 * 时间轴（见 PRD/演出层.md §7）
 *
 * 上排：播放/暂停/seek/倍速/重播/快进（走 `state/player`）
 * 下排：分镜缩略图 + 笔记进度
 * 并把播放中的 `focus` 同步到全局聚焦（画布高亮 + 文档滚动）。
 */
import { useEffect } from "react";
import { formatTime, player, usePlayer } from "../state/player";
import { setFocus } from "../state/focus";
import { ShotStrip } from "./ShotStrip";
import { ProgressPanel } from "./ProgressPanel";
import "./timeline.css";

export function TimelineBar() {
  const { t, duration, playing, rate, script, snapshot } = usePlayer();
  const hasScript = script !== null;

  // 播放/seek 时，把当前焦点同步出去（画布与文档会跟着动）
  const focus = snapshot?.focus ?? null;
  useEffect(() => {
    if (focus) setFocus(focus);
  }, [focus]);

  return (
    <footer className="timeline tl">
      <div className="tl-controls">
        <button
          className="tl-btn"
          type="button"
          onClick={() => player.toggle()}
          disabled={!hasScript}
          title={playing ? "暂停" : "播放"}
        >
          {playing ? "⏸" : "▶"}
        </button>

        <span className="tl-time">
          {formatTime(t)} / {formatTime(duration)}
        </span>

        <input
          className="tl-range"
          type="range"
          min={0}
          max={duration || 1}
          step={0.05}
          value={t}
          disabled={!hasScript}
          onChange={(e) => player.seek(Number(e.target.value))}
        />

        <button
          className="tl-btn tl-rate"
          type="button"
          onClick={() => player.cycleRate()}
          disabled={!hasScript}
          title="倍速"
        >
          {rate.toFixed(1)}x
        </button>

        <button className="tl-btn" type="button" onClick={() => player.replay()} disabled={!hasScript}>
          重播
        </button>

        <button
          className="tl-btn"
          type="button"
          onClick={() => player.nextKeyframe()}
          disabled={!hasScript}
          title="跳到下一个动作"
        >
          ≫ 快进
        </button>

        {!hasScript ? <span className="tl-hint">和 AI 对话后自动生成时间轴</span> : null}
      </div>

      <div className="tl-strip">
        <ShotStrip />
        <ProgressPanel />
      </div>
    </footer>
  );
}
