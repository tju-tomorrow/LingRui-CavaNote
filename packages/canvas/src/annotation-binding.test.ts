import { describe, expect, test } from "bun:test";
import type { Annotation } from "@lingrui/knowledge";
import { annotationToSpec, defaultAnnotation } from "./annotation-binding";

const base = (over: Partial<Annotation>): Annotation => ({
  id: "a1",
  type: "sticky",
  element: { type: "sticky", x: 10, y: 20, width: 100, height: 60 },
  provenance: { origin: "human", dirty: true },
  ...over,
});

describe("annotationToSpec", () => {
  test("cell id 就是 annotation.id（稳定可寻址）", () => {
    const spec = annotationToSpec(base({}));
    expect(spec.id).toBe("a1");
    expect(spec.annotationId).toBe("a1");
  });

  test("便签是顶点 + 文本", () => {
    const spec = annotationToSpec(base({ text: "注意雪崩" }));
    expect(spec.kind).toBe("vertex");
    expect(spec.style.shape).toBe("rectangle");
    expect(spec.value).toBe("注意雪崩");
  });

  test("高亮是半透明矩形", () => {
    const spec = annotationToSpec(
      base({ type: "highlight", element: { type: "highlight", x: 0, y: 0, width: 50, height: 20 } }),
    );
    expect(spec.kind).toBe("vertex");
    expect(spec.style.opacity).toBe(0.4);
  });

  test("手绘是浮动折线，点上叠元素原点（Excalidraw 相对坐标 → maxGraph 绝对）", () => {
    const spec = annotationToSpec(
      base({
        type: "draw",
        element: {
          type: "draw",
          x: 100,
          y: 200,
          width: 30,
          height: 10,
          points: [
            [0, 0],
            [15, 5],
            [30, 10],
          ],
        },
      }),
    );
    expect(spec.kind).toBe("edge");
    expect(spec.points).toEqual([
      [100, 200],
      [115, 205],
      [130, 210],
    ]);
    expect(spec.style.endArrow).toBe("none");
  });

  test("箭头带箭头标记", () => {
    const spec = annotationToSpec(
      base({
        type: "arrow",
        element: { type: "arrow", x: 0, y: 0, width: 40, height: 0, points: [[0, 0], [40, 0]] },
      }),
    );
    expect(spec.kind).toBe("edge");
    expect(spec.style.endArrow).toBe("classic");
  });

  test("颜色可被元素覆盖", () => {
    const spec = annotationToSpec(
      base({ element: { type: "sticky", x: 0, y: 0, width: 10, height: 10, backgroundColor: "#123456" } }),
    );
    expect(spec.style.fillColor).toBe("#123456");
  });
});

describe("defaultAnnotation", () => {
  test("按类型给默认尺寸，坐标落到给定点", () => {
    const a = defaultAnnotation("sticky", [5, 7], { id: "x" });
    expect(a.type).toBe("sticky");
    expect(a.element.x).toBe(5);
    expect(a.element.y).toBe(7);
    expect(a.element.width).toBeGreaterThan(0);
    expect(a.element.height).toBeGreaterThan(0);
    expect(a.id).toBe("x");
  });

  test("attachedTo 会带上", () => {
    const a = defaultAnnotation("highlight", [0, 0], { id: "h", attachedTo: "db" });
    expect(a.attachedTo).toBe("db");
  });
});
