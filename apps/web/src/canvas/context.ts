/**
 * 冻结画布上下文（ADR-0011 决策 4）
 *
 * 一次 freeze 里同时产出：
 *   - 截图（整幅、2x 超采样、白底，排除临时选中框）
 *   - CanvasSnapshot（可寻址 id）
 * 两者共用同一个 version，避免漂移。
 */
import { exportToBlob } from "@excalidraw/excalidraw";
import {
  createScreenshotCache,
  freezeContext,
  sceneFingerprint,
  type FrozenContext,
} from "@lingrui/ai";
import { ydoc } from "../collab/doc";
import { getFocus } from "../state/focus";
import { getCanvas } from "./bridge";

/** 单调递增：保证「截图与数据同一时刻」 */
let version = 0;

/** 画布没变就不重复截（指纹见 packages/ai/src/screenshot-cache.ts） */
const screenshotCache = createScreenshotCache();

export function currentContextVersion(): number {
  return version;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("读取截图失败"));
    reader.readAsDataURL(blob);
  });
}

/**
 * 截图失败不应阻塞回灌 —— 只给数据也能让 AI 改得精确，
 * 只是少了「视觉意图」那一层。
 */
async function captureScreenshot(): Promise<string | undefined> {
  const api = getCanvas();
  if (!api) return undefined;

  const appState = api.getAppState();
  const fingerprint = sceneFingerprint(api.getSceneElements(), {
    scrollX: appState.scrollX,
    scrollY: appState.scrollY,
    zoom: appState.zoom.value,
  });

  // 画布没变就复用上一次的截图
  const cached = screenshotCache.get(fingerprint);
  if (cached) return cached;

  try {
    const blob = await exportToBlob({
      elements: api.getSceneElements(),
      appState: {
        ...appState,
        exportBackground: true,
        viewBackgroundColor: "#ffffff",
        exportWithDarkMode: false,
        // 排除临时选中框
        selectedElementIds: {},
      },
      files: api.getFiles(),
      // 2x 超采样
      getDimensions: (width: number, height: number) => ({ width, height, scale: 2 }),
      mimeType: "image/png",
      exportPadding: 16,
    });
    const screenshot = await blobToDataUrl(blob);
    screenshotCache.set(fingerprint, screenshot);
    return screenshot;
  } catch {
    return undefined;
  }
}

export async function freezeCanvasContext(): Promise<FrozenContext | null> {
  const api = getCanvas();
  if (!api) return null;

  const state = api.getAppState();
  const screenshot = await captureScreenshot();

  version += 1;
  const frozen = freezeContext(ydoc, {
    version,
    viewport: {
      scrollX: state.scrollX,
      scrollY: state.scrollY,
      zoom: state.zoom.value,
      width: state.width,
      height: state.height,
    },
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
