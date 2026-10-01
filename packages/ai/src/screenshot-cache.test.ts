import { describe, expect, test } from "bun:test";
import { createScreenshotCache, sceneFingerprint } from "./screenshot-cache";

const viewport = { scrollX: 0, scrollY: 0, zoom: 1 };

function el(id: string, x = 0, y = 0, version = 1) {
  return { id, x, y, width: 250, height: 96, version };
}

describe("sceneFingerprint", () => {
  test("同样输入得到同样指纹", () => {
    expect(sceneFingerprint([el("a")], viewport)).toBe(sceneFingerprint([el("a")], viewport));
  });

  test("元素移动会变", () => {
    expect(sceneFingerprint([el("a", 0, 0)], viewport)).not.toBe(
      sceneFingerprint([el("a", 10, 0)], viewport),
    );
  });

  test("元素增删会变", () => {
    expect(sceneFingerprint([el("a")], viewport)).not.toBe(
      sceneFingerprint([el("a"), el("b")], viewport),
    );
  });

  test("视口变化会变（截图范围不同）", () => {
    expect(sceneFingerprint([el("a")], viewport)).not.toBe(
      sceneFingerprint([el("a")], { ...viewport, zoom: 2 }),
    );
    expect(sceneFingerprint([el("a")], viewport)).not.toBe(
      sceneFingerprint([el("a")], { ...viewport, scrollX: 40 }),
    );
  });

  test("亚像素抖动会被抹平（避免无意义的重新截图）", () => {
    expect(sceneFingerprint([el("a", 10.2)], viewport)).toBe(
      sceneFingerprint([el("a", 10.4)], viewport),
    );
  });
});

describe("createScreenshotCache", () => {
  test("指纹相同 → 复用，不增加截图次数", () => {
    const cache = createScreenshotCache();
    expect(cache.get("f1")).toBeUndefined(); // 还没截过

    cache.set("f1", "data:image/png;base64,AAA");
    expect(cache.get("f1")).toBe("data:image/png;base64,AAA");
    expect(cache.captureCount()).toBe(1);

    // 再来两次同样的指纹，依然复用
    cache.get("f1");
    cache.get("f1");
    expect(cache.captureCount()).toBe(1);
  });

  test("指纹变化 → 需要重新截", () => {
    const cache = createScreenshotCache();
    cache.set("f1", "AAA");
    expect(cache.get("f2")).toBeUndefined();

    cache.set("f2", "BBB");
    expect(cache.get("f2")).toBe("BBB");
    expect(cache.captureCount()).toBe(2);
  });

  test("回到旧指纹不会命中（只保留最近一次）", () => {
    const cache = createScreenshotCache();
    cache.set("f1", "AAA");
    cache.set("f2", "BBB");
    expect(cache.get("f1")).toBeUndefined();
    expect(cache.lastFingerprint()).toBe("f2");
  });
});
