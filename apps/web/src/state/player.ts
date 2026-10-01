/**
 * 演出播放器 —— 时间轴的唯一状态源（见 PRD/演出层.md §2）
 *
 * 不变量：播放状态是**时间的纯函数**。这里只维护 t / playing / rate，
 * 由 `sampleAt(script, t)` 派生 snapshot；渲染层订阅 snapshot。
 *
 * 由本模块自己的 rAF 推进 t；渲染层**不**各自起循环。
 */
import { sampleAt, type Action, type SceneScript, type SceneState, type Shot } from "@lingrui/anim";
import { useSyncExternalStore } from "react";

export interface PlayerState {
  script: SceneScript | null;
  t: number;
  duration: number;
  playing: boolean;
  rate: number;
  snapshot: SceneState | null;
  /** 分镜（缩略图） */
  chapters: Shot[];
}

export const RATES = [0.5, 1, 1.5, 2] as const;

let state: PlayerState = {
  script: null,
  t: 0,
  duration: 0,
  playing: false,
  rate: 1,
  snapshot: null,
  chapters: [],
};

const listeners = new Set<() => void>();
let raf = 0;
let last = 0;

function emit(): void {
  for (const l of listeners) l();
}

function withT(script: SceneScript, t: number): PlayerState {
  const clamped = Math.max(0, Math.min(script.duration, t));
  return { ...state, script, t: clamped, duration: script.duration, snapshot: sampleAt(script, clamped) };
}

/** 把一串动作编译成可播放的 SceneScript（留 2s 尾巴） */
export function buildScript(actions: Action[], title = "演出"): SceneScript {
  const end = actions.reduce((m, a) => Math.max(m, a.t), 0);
  return { id: "live", title, duration: Math.max(2, end + 2), actions: [...actions] };
}

function loop(now: number): void {
  if (!state.playing || !state.script) {
    raf = 0;
    return;
  }
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const script = state.script;
  const next = state.t + dt * state.rate;
  if (next >= script.duration) {
    state = { ...withT(script, script.duration), playing: false };
    emit();
    raf = 0;
    return;
  }
  state = withT(script, next);
  emit();
  raf = requestAnimationFrame(loop);
}

function start(): void {
  if (raf) return;
  last = performance.now();
  raf = requestAnimationFrame(loop);
}

export const player = {
  /** 装载动作流；给了 autoplayFrom 就自动从该时刻播放（AI 每轮生成后调用） */
  load(actions: Action[], title?: string, autoplayFrom?: number, chapters: Shot[] = []): void {
    if (actions.length === 0) return;
    const script = buildScript(actions, title);
    state = { ...withT(script, autoplayFrom ?? 0), chapters };
    emit();
    if (autoplayFrom !== undefined) player.play();
  },
  play(): void {
    if (!state.script) return;
    const t = state.t >= state.script.duration ? 0 : state.t;
    state = { ...withT(state.script, t), playing: true };
    emit();
    start();
  },
  pause(): void {
    if (!state.playing) return;
    state = { ...state, playing: false };
    emit();
  },
  toggle(): void {
    if (state.playing) player.pause();
    else player.play();
  },
  /** 重播：归零后播放 */
  replay(): void {
    if (!state.script) return;
    state = { ...withT(state.script, 0), playing: true };
    emit();
    start();
  },
  seek(t: number): void {
    if (!state.script) return;
    state = withT(state.script, t);
    emit();
  },
  /** 快进：跳到下一个动作时刻 */
  nextKeyframe(): void {
    if (!state.script) return;
    const times = [...new Set(state.script.actions.map((a) => a.t))].sort((a, b) => a - b);
    const next = times.find((x) => x > state.t + 0.01);
    player.seek(next ?? state.script.duration);
  },

  /**
   * 跳到下一个 / 上一个**分镜**（章节）。
   *
   * 比逐动作跳更符合「讲解」的心智模型：用户想听下一段，不是下一帧。
   * 章节优先用 Y.Doc 里持久化的那份（可能被人工改过）。
   */
  nextShot(): void {
    if (!state.script) return;
    const shots = state.chapters.length > 0 ? state.chapters : [];
    const next = shots.find((s) => s.startT > state.t + 0.01);
    if (next) player.seek(next.startT);
    else player.seek(state.script.duration);
  },

  prevShot(): void {
    if (!state.script) return;
    const shots = state.chapters;
    // 当前分镜的头 1 秒内 → 退到上一段；否则先回到本段开头
    const current = [...shots].reverse().find((s) => s.startT <= state.t + 0.01);
    if (current && state.t - current.startT > 1) {
      player.seek(current.startT);
      return;
    }
    const prev = [...shots].reverse().find((s) => s.startT < state.t - 1.01);
    player.seek(prev ? prev.startT : 0);
  },
  setRate(rate: number): void {
    state = { ...state, rate };
    emit();
  },
  cycleRate(): void {
    const i = RATES.indexOf(state.rate as (typeof RATES)[number]);
    const next = RATES[(i + 1) % RATES.length] ?? 1;
    player.setRate(next);
  },
  clear(): void {
    state = { script: null, t: 0, duration: 0, playing: false, rate: state.rate, snapshot: null, chapters: [] };
    emit();
  },
};

export function getPlayerState(): PlayerState {
  return state;
}

export function subscribePlayer(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function usePlayer(): PlayerState {
  return useSyncExternalStore(subscribePlayer, getPlayerState, getPlayerState);
}

export function formatTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
