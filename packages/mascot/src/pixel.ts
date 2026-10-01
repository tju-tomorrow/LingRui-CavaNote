/**
 * @lingrui/mascot — 像素宠物引擎（Personal Pet，像素形态）
 *
 * 见 `PRD/宠物.md` §4/§5。像素是**首选形态**：无需外部资产、sprite 状态驱动、
 * 与视频导出天然契合。
 *
 * 本文件是**纯逻辑**（生成 / 取帧 / 绘制 / 位移），可脱离 DOM 单测；
 * 需要 canvas 的控制器在 `pet.ts`。
 *
 * 帧格式：每帧是 H 行、每行 W 个字符。`.` = 透明；`0`~`4` = 调色板下标。
 *   0 描边/眼睛 · 1 身体 · 2 肚皮 · 3 强调 · 4 白
 */
import type { PetState, PixelAvatar } from "@lingrui/knowledge";
import { PET_STATES } from "@lingrui/knowledge";

export type PixelFrame = string[];
export interface PixelClip {
  frames: PixelFrame[];
  fps: number;
  loop: boolean;
}
export type PixelClips = Record<PetState, PixelClip>;

export const GRID_W = 16;
export const GRID_H = 12;
export const DEFAULT_SCALE = 4;

const TRANSPARENT = ".";

// ---------------------------------------------------------------------------
// 网格工具
// ---------------------------------------------------------------------------

type Grid = string[][];

function blank(): Grid {
  return Array.from({ length: GRID_H }, () => Array.from({ length: GRID_W }, () => TRANSPARENT));
}

function put(g: Grid, x: number, y: number, ch: string): void {
  if (x < 0 || y < 0 || x >= GRID_W || y >= GRID_H) return;
  const row = g[y];
  if (row) row[x] = ch;
}

function fill(g: Grid, x: number, y: number, w: number, h: number, ch: string): void {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) put(g, x + i, y + j, ch);
}

function outline(g: Grid, x: number, y: number, w: number, h: number, ch: string): void {
  for (let i = 0; i < w; i++) {
    put(g, x + i, y, ch);
    put(g, x + i, y + h - 1, ch);
  }
  for (let j = 0; j < h; j++) {
    put(g, x, y + j, ch);
    put(g, x + w - 1, y + j, ch);
  }
}

function toFrame(g: Grid): PixelFrame {
  return g.map((row) => row.join(""));
}

// ---------------------------------------------------------------------------
// 生物体（对齐参考图：珊瑚色像素小生物，黑色方眼）
// ---------------------------------------------------------------------------

function creature(legPhase: 0 | 1, seed: number): Grid {
  const g = blank();

  // 触角
  put(g, 4, 2, "0");
  put(g, 4, 3, "0");
  put(g, 11, 2, "0");
  put(g, 11, 3, "0");

  // 身体
  fill(g, 2, 4, 12, 5, "1");
  outline(g, 2, 4, 12, 5, "0");

  // 肚皮
  fill(g, 5, 6, 6, 2, "2");

  // 眼睛（黑色方块）
  put(g, 5, 5, "0");
  put(g, 5, 6, "0");
  put(g, 10, 5, "0");
  put(g, 10, 6, "0");

  // 腿（种子决定 4 或 6 条；phase 决定交错）
  const base = seed % 2 === 0 ? [4, 6, 9, 11] : [3, 5, 7, 9, 11, 12];
  const xs = legPhase === 0 ? base : base.map((x) => x + (x % 2 === 0 ? -1 : 1));
  for (const x of xs) {
    put(g, x, 9, "1");
    put(g, x, 10, "0");
  }
  return g;
}

function withBlink(seed: number): Grid {
  const g = creature(0, seed);
  put(g, 5, 5, "2");
  put(g, 10, 5, "2");
  return g;
}

function withMouth(seed: number, open: boolean): Grid {
  const g = creature(0, seed);
  if (open) {
    put(g, 7, 7, "0");
    put(g, 8, 7, "0");
  }
  return g;
}

function withPoint(seed: number): Grid {
  const g = creature(0, seed);
  put(g, 14, 5, "1");
  put(g, 15, 5, "0");
  return g;
}

function withArmsUp(seed: number): Grid {
  const g = creature(0, seed);
  put(g, 1, 3, "1");
  put(g, 1, 4, "0");
  put(g, 14, 3, "1");
  put(g, 14, 4, "0");
  return g;
}

function withBubble(seed: number, dots: number): Grid {
  const g = creature(0, seed);
  for (let i = 0; i < dots; i++) put(g, 12 + i * 2 > 15 ? 15 : 12 + i * 2, 1, "0");
  return g;
}

function withQuestion(seed: number, phase: 0 | 1): Grid {
  const g = creature(0, seed);
  const y = phase === 0 ? 0 : 1;
  put(g, 13, y, "0");
  put(g, 14, y, "0");
  put(g, 14, y + 1, "0");
  put(g, 13, y + 2, "0");
  put(g, 13, y + 3, "0");
  return g;
}

function withSleep(seed: number): Grid {
  const g = withBlink(seed);
  put(g, 13, 1, "0");
  put(g, 14, 1, "0");
  put(g, 13, 2, "0");
  put(g, 13, 3, "0");
  return g;
}

// ---------------------------------------------------------------------------
// 生成
// ---------------------------------------------------------------------------

/** 由调色板 + 种子程序化生成全部状态的帧组（无需外部资产） */
export function generatePixelClips(avatar: PixelAvatar): PixelClips {
  const seed = avatar.seed || 0;
  return {
    idle: { fps: 3, loop: true, frames: [toFrame(creature(0, seed)), toFrame(withBlink(seed))] },
    think: { fps: 2, loop: true, frames: [toFrame(withBubble(seed, 1)), toFrame(withBubble(seed, 3))] },
    explain: { fps: 6, loop: true, frames: [toFrame(withMouth(seed, false)), toFrame(withMouth(seed, true))] },
    point: { fps: 2, loop: true, frames: [toFrame(creature(0, seed)), toFrame(withPoint(seed))] },
    run: { fps: 8, loop: true, frames: [toFrame(creature(0, seed)), toFrame(creature(1, seed))] },
    celebrate: { fps: 5, loop: true, frames: [toFrame(creature(0, seed)), toFrame(withArmsUp(seed))] },
    confused: { fps: 2, loop: true, frames: [toFrame(withQuestion(seed, 0)), toFrame(withQuestion(seed, 1))] },
    sleep: { fps: 1, loop: true, frames: [toFrame(withSleep(seed))] },
  };
}

/** 当前时间对应第几帧（纯函数） */
export function frameIndexAt(clip: PixelClip, t: number): number {
  const n = clip.frames.length;
  if (n === 0) return 0;
  const raw = Math.floor(Math.max(0, t) * clip.fps);
  return clip.loop ? raw % n : Math.min(raw, n - 1);
}

/** 取某状态的当前帧 */
export function frameFor(clips: PixelClips, state: PetState, t: number): PixelFrame {
  const clip = clips[state];
  return clip.frames[frameIndexAt(clip, t)] ?? [];
}

export interface DrawPixelOptions {
  x: number;
  y: number;
  scale?: number;
}

/** 把一帧画到 2D canvas 上 */
export function drawPixelFrame(
  ctx: CanvasRenderingContext2D,
  frame: PixelFrame,
  palette: string[],
  opts: DrawPixelOptions,
): void {
  const scale = opts.scale ?? DEFAULT_SCALE;
  for (let y = 0; y < frame.length; y++) {
    const row = frame[y];
    if (!row) continue;
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (!ch || ch === TRANSPARENT) continue;
      const color = palette[Number(ch)];
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(opts.x + x * scale, opts.y + y * scale, scale, scale);
    }
  }
}

/** 朝目标移动（纯函数）；返回下一位置 */
export function stepTowards(
  at: readonly [number, number],
  target: readonly [number, number],
  speed: number,
  dt: number,
): [number, number] {
  const dx = target[0] - at[0];
  const dy = target[1] - at[1];
  const dist = Math.hypot(dx, dy);
  const step = Math.max(0, speed) * Math.max(0, dt);
  if (dist <= step || dist === 0) return [target[0], target[1]];
  return [at[0] + (dx / dist) * step, at[1] + (dy / dist) * step];
}

/** 状态 → 期望移动速度（画布单位/秒） */
export const PET_SPEED: Record<PetState, number> = {
  idle: 0,
  think: 0,
  explain: 0,
  point: 0,
  run: 320,
  celebrate: 0,
  confused: 0,
  sleep: 0,
};

export { PET_STATES };
