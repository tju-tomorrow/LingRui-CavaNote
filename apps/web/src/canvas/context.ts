/**
 * 冻结画布上下文（ADR-0011 决策 4 / ADR-0013 引擎换成 maxGraph）
 *
 * 一次 freeze 里同时产出：
 *   - 截图（当前视口，白底）
 *   - CanvasSnapshot（可寻址 id）
 * 两者共用同一个 version，避免漂移。
 */
import {
  createScreenshotCache,
  freezeContext,
  sceneFingerprint,
  type FrozenContext,
} from "@lingrui/ai";
import { ydoc } from "../collab/doc";
import { getFocus } from "../state/focus";
import { getCanvas } from "./bridge";
import { exportViewportPng } from "./snapshot";

/** 单调递增：保证「截图与数据同一时刻」 */
let version = 0;

/** 画布没变就不重复截（指纹见 packages/ai/src/screenshot-cache.ts） */
const screenshotCache = createScreenshotCache();

export function currentContextVersion(): number {
  return version;
}

/**
 * 截图失败不应阻塞回灌 —— 只给数据也能让 AI 改得精确，
 * 只是少了「视觉意图」那一层。
 */
async function captureScreenshot(): Promise<string | undefined> {
  const engine = getCanvas();
  if (!engine) return undefined;

  const viewport = engine.viewport();
  const fingerprint = sceneFingerprint(engine.elements(), {
    scrollX: viewport.scrollX,
    scrollY: viewport.scrollY,
    zoom: viewport.zoom,
  });

  const cached = screenshotCache.get(fingerprint);
  if (cached) return cached;

  try {
    const screenshot = await exportViewportPng({ scale: 2, background: "#ffffff" });
    if (!screenshot) return undefined;
    screenshotCache.set(fingerprint, screenshot);
    return screenshot;
  } catch {
    return undefined;
  }
}

export async function freezeCanvasContext(): Promise<FrozenContext | null> {
  const engine = getCanvas();
  // 画布收起时引擎未挂载，但**结构化数据仍在 Y.Doc 里**。
  // 之前直接 return null → AI 既没截图也没数据，连「这张图怎么走」都答不了。
  // 现在退回「无截图、有数据」：截图缺失不阻塞回灌（见 captureScreenshot 注释）。
  const viewport = engine
    ? engine.viewport()
    : {
        scrollX: 0,
        scrollY: 0,
        zoom: 1,
        width: typeof window === "undefined" ? 0 : window.innerWidth,
        height: typeof window === "undefined" ? 0 : window.innerHeight,
      };
  const screenshot = await captureScreenshot();

  version += 1;
  const frozen = freezeContext(ydoc, {
    version,
    viewport,
    focus: getFocus() ?? undefined,
    screenshot,
  });

  if (import.meta.env.DEV) {
    // 开发期调试通道：确认「截图 + 数据同版本冻结」真的生效
    (window as unknown as Record<string, unknown>)["__contextPack"] = {
      version: frozen.version,
      screenshotBytes: frozen.screenshot?.length ?? 0,
      captureCount: screenshotCache.captureCount(),
      nodes: frozen.snapshot.nodes.length,
      annotations: frozen.snapshot.annotations.length,
      chapters: frozen.snapshot.chapters.length,
    };
  }

  return frozen;
}
