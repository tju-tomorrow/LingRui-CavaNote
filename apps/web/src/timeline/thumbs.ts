/**
 * 分镜缩略图缓存（PRD/演出层.md §4 / ADR-0013 引擎换成 maxGraph）
 *
 * 懒截图：播到/拖到哪个分镜，就截哪一张。没看过的分镜仍显示 SVG 迷你示意图。
 * 失效：场景元素数变了就重截。
 */
import { getCanvas } from "../canvas/bridge";
import { exportViewportPng } from "../canvas/snapshot";

interface Thumb {
  url: string;
  sceneSize: number;
}

const cache = new Map<string, Thumb>();
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

export function subscribeThumbs(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function thumbOf(shotId: string): string | undefined {
  return cache.get(shotId)?.url;
}

/** 分镜列表变了（新一轮 AI 演出）→ 旧缩略图没意义了 */
export function clearThumbs(): void {
  if (cache.size === 0) return;
  cache.clear();
  emit();
}

let inFlight = false;

/**
 * 给当前分镜截一张。调用方在「当前分镜变了」时触发即可。
 * 失败静默（截图只是锦上添花，不能影响演出）。
 */
export async function captureThumb(shotId: string): Promise<void> {
  const engine = getCanvas();
  if (!engine || inFlight) return;

  const sceneSize = engine.elements().length;
  const cached = cache.get(shotId);
  if (cached && cached.sceneSize === sceneSize) return;

  inFlight = true;
  try {
    const url = await exportViewportPng({ width: 320, background: "#ffffff" });
    if (!url) return;
    cache.set(shotId, { url, sceneSize });
    emit();
  } catch {
    /* 截图失败不影响演出 */
  } finally {
    inFlight = false;
  }
}
