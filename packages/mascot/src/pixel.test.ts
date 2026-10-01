import { describe, expect, test } from "bun:test";
import {
  GRID_H,
  GRID_W,
  PET_SPEED,
  drawPixelFrame,
  frameFor,
  frameIndexAt,
  generatePixelClips,
  stepTowards,
} from "./pixel";
import type { PixelAvatar } from "@lingrui/knowledge";
import { PET_STATES } from "@lingrui/knowledge";

const avatar: PixelAvatar = {
  kind: "pixel",
  palette: ["#1e1e1e", "#d97757", "#f0b8a8", "#e5484d", "#ffffff"],
  seed: 7,
  scale: 4,
};

describe("generatePixelClips", () => {
  const clips = generatePixelClips(avatar);

  test("八个教学状态都有帧组", () => {
    for (const s of PET_STATES) expect(clips[s].frames.length).toBeGreaterThan(0);
  });

  test("每帧尺寸一致（16x12）", () => {
    for (const s of PET_STATES) {
      for (const frame of clips[s].frames) {
        expect(frame.length).toBe(GRID_H);
        for (const row of frame) expect(row.length).toBe(GRID_W);
      }
    }
  });

  test("帧只含 · 与 0-4 调色板字符", () => {
    for (const s of PET_STATES) {
      for (const frame of clips[s].frames) {
        for (const row of frame) expect(/^[.0-4]*$/.test(row)).toBe(true);
      }
    }
  });

  test("种子不同会改变腿数（参数化）", () => {
    const a = generatePixelClips({ ...avatar, seed: 0 }).idle.frames[0]!.join("");
    const b = generatePixelClips({ ...avatar, seed: 1 }).idle.frames[0]!.join("");
    expect(a).not.toBe(b);
  });
});

describe("frameIndexAt", () => {
  test("循环：按 fps 取模", () => {
    const clip = { frames: [["a"], ["b"], ["c"]], fps: 10, loop: true };
    expect(frameIndexAt(clip, 0)).toBe(0);
    expect(frameIndexAt(clip, 0.1)).toBe(1);
    expect(frameIndexAt(clip, 0.35)).toBe(0); // 0.35*10 = 3 -> 3 % 3 = 0
  });

  test("不循环：到最后一帧停住", () => {
    const clip = { frames: [["a"], ["b"]], fps: 10, loop: false };
    expect(frameIndexAt(clip, 5)).toBe(1);
  });

  test("负时间当 0", () => {
    expect(frameIndexAt({ frames: [["a"]], fps: 10, loop: true }, -3)).toBe(0);
  });
});

describe("frameFor", () => {
  test("返回合法帧", () => {
    const clips = generatePixelClips(avatar);
    const frame = frameFor(clips, "run", 0.3);
    expect(frame.length).toBe(GRID_H);
  });
});

describe("stepTowards", () => {
  test("未到目标时按速度前进", () => {
    const [x, y] = stepTowards([0, 0], [100, 0], 10, 1);
    expect(x).toBeCloseTo(10);
    expect(y).toBe(0);
  });

  test("足够近时精确落到目标", () => {
    expect(stepTowards([0, 0], [3, 4], 100, 1)).toEqual([3, 4]);
  });

  test("dt=0 不动", () => {
    expect(stepTowards([5, 5], [100, 100], 10, 0)).toEqual([5, 5]);
  });
});

describe("drawPixelFrame", () => {
  test("只对非透明像素调用 fillRect", () => {
    const calls: Array<[number, number, number, number]> = [];
    const ctx = {
      fillStyle: "",
      fillRect(x: number, y: number, w: number, h: number) {
        calls.push([x, y, w, h]);
      },
    } as unknown as CanvasRenderingContext2D;
    drawPixelFrame(ctx, ["0.1.", "...."], avatar.palette, { x: 0, y: 0, scale: 2 });
    expect(calls.length).toBe(2);
    expect(calls[0]).toEqual([0, 0, 2, 2]);
    expect(calls[1]).toEqual([4, 0, 2, 2]);
  });
});

describe("PET_SPEED", () => {
  test("只有 run 会移动", () => {
    expect(PET_SPEED.run).toBeGreaterThan(0);
    for (const s of PET_STATES) if (s !== "run") expect(PET_SPEED[s]).toBe(0);
  });
});
