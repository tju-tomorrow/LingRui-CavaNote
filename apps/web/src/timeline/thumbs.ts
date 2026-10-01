/**
 * 分镜缩略图缓存（PRD/演出层.md §4：「在 t = startT 对画布离屏截图，缓存；
 * 内容变化时失效重建」）
 *
 * 实现取舍：**懒截图**。
 * 真的为每个分镜去 seek 一遍再截图，会打断用户的播放（seek 有副作用、还会触发联动）。
 * 所以改成：**播到/拖到哪个分镜，就截哪一张** —— 非侵入，且用户看过的分镜立刻有真图。
 * 没看过的分镜仍然显示 SVG 迷你示意图（不是空白）。
 *
 * 失效：场景元素数变了就重截（AI 改过画布 → 旧图不再代表现状）。
 */
import { exportToBlob } from "@excalidraw/excalidraw";
import { getCanvas } from "../canvas/bridge";

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

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

let inFlight = false;

/**
 * 给当前分镜截一张。调用方在「当前分镜变了」时触发即可。
 * 失败静默（截图只是锦上添花，不能影响演出）。
 */
export async function captureThumb(shotId: string): Promise<void> {
  const api = getCanvas();
  if (!api || inFlight) return;

  const elements = api.getSceneElements();
  const sceneSize = elements.length;
  const cached = cache.get(shotId);
  if (cached && cached.sceneSize === sceneSize) return;

  inFlight = true;
  try {
    const appState = api.getAppState();
    const blob = await exportToBlob({
      elements,
      appState: {
        ...appState,
        exportBackground: true,
        viewBackgroundColor: "#ffffff",
        exportWithDarkMode: false,
        selectedElementIds: {},
      },
      files: api.getFiles(),
      // 小图：缩略图条里只有 ~150px 宽
      getDimensions: (width: number, height: number) => ({
        width: 320,
        height: Math.max(1, Math.round((320 * height) / Math.max(1, width))),
        scale: 1,
      }),
      mimeType: "image/png",
      exportPadding: 8,
    });
    cache.set(shotId, { url: await blobToDataUrl(blob), sceneSize });
    emit();
  } catch {
    /* 截图失败不影响演出 */
  } finally {
    inFlight = false;
  }
}
