/**
 * 截图缓存 —— 画布没变就不重复截（ADR-0011「截图成本」）
 *
 * 每次提问都截整幅（2x 超采样）不便宜，而多数连续提问之间画布并没有变。
 * 用「画布指纹」做记忆化：指纹一样就复用上一次的 data URL。
 *
 * 抽成纯函数是为了能测——真正截图的 exportToBlob 依赖 DOM。
 */

export interface FingerprintElement {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  version?: number;
}

export interface FingerprintViewport {
  scrollX: number;
  scrollY: number;
  zoom: number;
}

/**
 * 画布指纹：元素几何 + 视口。
 * 用简单的 31 进制滚动哈希；不需要密码学强度，只要"变了就不一样"。
 */
export function sceneFingerprint(
  elements: readonly FingerprintElement[],
  viewport: FingerprintViewport,
): string {
  let hash = 0;

  for (const element of elements) {
    const text = [
      element.id,
      Math.round(element.x),
      Math.round(element.y),
      Math.round(element.width),
      Math.round(element.height),
      element.version ?? 0,
    ].join(",");
    for (let i = 0; i < text.length; i += 1) {
      hash = (hash * 31 + text.charCodeAt(i)) | 0;
    }
  }

  return [
    elements.length,
    hash,
    viewport.scrollX.toFixed(1),
    viewport.scrollY.toFixed(1),
    viewport.zoom.toFixed(2),
  ].join(":");
}

export interface ScreenshotCache {
  /** 指纹命中则返回缓存；否则 undefined（调用方去截图） */
  get(fingerprint: string): string | undefined;
  set(fingerprint: string, screenshot: string): void;
  /** 实际截图次数（复用不计），用于验证"没变就不截" */
  captureCount(): number;
  /** 上次的指纹（调试用） */
  lastFingerprint(): string | undefined;
}

export function createScreenshotCache(): ScreenshotCache {
  let last: { fingerprint: string; screenshot: string } | null = null;
  let captures = 0;

  return {
    get(fingerprint) {
      return last?.fingerprint === fingerprint ? last.screenshot : undefined;
    },
    set(fingerprint, screenshot) {
      last = { fingerprint, screenshot };
      captures += 1;
    },
    captureCount: () => captures,
    lastFingerprint: () => last?.fingerprint,
  };
}
