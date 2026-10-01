/**
 * @lingrui/mascot — 像素宠物控制器（需要 DOM canvas）
 *
 * 纯逻辑在 `pixel.ts`；这里只做"把帧画到 canvas + 按状态/位置推进"。
 * 由应用的 rAF 驱动 `tick(dt)`，控制器不自己起循环（与 ADR-0005「分帧原则」一致）。
 */
import type { PetSpec, PetState } from "@lingrui/knowledge";
import {
  DEFAULT_SCALE,
  GRID_H,
  GRID_W,
  PET_SPEED,
  drawPixelFrame,
  frameFor,
  generatePixelClips,
  stepTowards,
  type PixelClips,
} from "./pixel";

export interface PixelPetController {
  setState(state: PetState): void;
  readonly state: PetState;
  moveTo(at: readonly [number, number]): void;
  setPosition(x: number, y: number): void;
  readonly position: readonly [number, number];
  /** 每帧推进 dt 秒并重绘 */
  tick(dtSeconds: number): void;
  /** 宠物在 canvas 上的像素尺寸 */
  readonly size: readonly [number, number];
  dispose(): void;
}

/** 从 PetSpec 取像素调色板；非像素形态回落到默认调色板 */
export function paletteOf(spec: PetSpec): string[] {
  if (spec.avatar.kind === "pixel") return spec.avatar.palette;
  return ["#1e1e1e", "#d97757", "#f0b8a8", "#e5484d", "#ffffff"];
}

function pixelScale(spec: PetSpec): number {
  return spec.avatar.kind === "pixel" ? (spec.avatar.scale ?? DEFAULT_SCALE) : DEFAULT_SCALE;
}

function pixelClipsOf(spec: PetSpec): PixelClips {
  if (spec.avatar.kind === "pixel") return generatePixelClips(spec.avatar);
  // 非像素形态暂用默认种子生成占位帧，保证仍可显示
  return generatePixelClips({ kind: "pixel", palette: paletteOf(spec), seed: 7 });
}

export function createPixelPet(canvas: HTMLCanvasElement, spec: PetSpec): PixelPetController {
  const context = canvas.getContext("2d");
  if (!context) throw new Error("createPixelPet: 无法获取 2D context");
  const ctx: CanvasRenderingContext2D = context;

  const clips = pixelClipsOf(spec);
  const palette = paletteOf(spec);
  const scale = pixelScale(spec);
  const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;

  const width = GRID_W * scale;
  const height = GRID_H * scale;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  ctx.scale(dpr, dpr);

  let state: PetState = "idle";
  let t = 0; // 当前状态内累计时间（秒）
  let at: [number, number] = [0, 0];
  let target: [number, number] | null = null;

  function draw(): void {
    ctx.clearRect(0, 0, width, height);
    const frame = frameFor(clips, state, t);
    drawPixelFrame(ctx, frame, palette, { x: 0, y: 0, scale });
  }

  const controller: PixelPetController = {
    setState(next: PetState): void {
      if (next === state) return;
      state = next;
      t = 0;
      if (PET_SPEED[next] === 0) target = null;
      draw();
    },
    get state() {
      return state;
    },
    moveTo(next): void {
      target = [next[0], next[1]];
      this.setState("run");
    },
    setPosition(x, y): void {
      at = [x, y];
      target = null;
    },
    get position() {
      return at;
    },
    get size() {
      return [width, height] as const;
    },
    tick(dt: number): void {
      t += dt;
      if (target && PET_SPEED[state] > 0) {
        const next = stepTowards(at, target, PET_SPEED[state], dt);
        at = next;
        if (next[0] === target[0] && next[1] === target[1]) {
          target = null;
          state = "idle";
          t = 0;
        }
      }
      draw();
    },
    dispose(): void {
      target = null;
    },
  };

  draw();
  return controller;
}
