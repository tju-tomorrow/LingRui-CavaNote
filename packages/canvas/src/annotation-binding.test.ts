import { describe, expect, test } from "bun:test";
import type { Annotation } from "@lingrui/knowledge";
import {
  annotationIdOf,
  annotationToExcalidrawElement,
  elementToAnnotation,
  isAnnotationElement,
  isNodeElement,
  sameAnnotation,
} from "./annotation-binding";
import { diffScene } from "./scene-diff";
import { planAnnotationSync } from "./annotation-binding";
import type { DiffableElement } from "./scene-diff";

const freehand = {
  id: "draw-1",
  type: "freedraw",
  x: 10,
  y: 20,
  width: 80,
  height: 40,
  points: [
    [0, 0],
    [40, 40],
  ] as ReadonlyArray<readonly [number, number]>,
  strokeColor: "#e03131",
  customData: {},
};

const stickyEl = {
  id: "note-1",
  type: "rectangle",
  x: 300,
  y: 0,
  width: 200,
  height: 120,
  customData: {},
};

describe("归属判定", () => {
  test("注释元素靠 customData.annotationId 认出", () => {
    expect(isAnnotationElement({ customData: { lingrui: true, annotationId: "a1" } })).toBe(true);
    expect(isAnnotationElement({ customData: { lingrui: true, nodeId: "gateway" } })).toBe(false);
    expect(isAnnotationElement({ customData: {} })).toBe(false);
  });

  test("节点元素是 lingrui 且不是注释", () => {
    expect(isNodeElement({ customData: { lingrui: true, nodeId: "gateway" } })).toBe(true);
    expect(isNodeElement({ customData: { lingrui: true, annotationId: "a1" } })).toBe(false);
    expect(isNodeElement({ customData: {} })).toBe(false);
  });

  test("未落盘的元素取不到 annotationId", () => {
    expect(annotationIdOf({ id: "x", customData: {} })).toBeUndefined();
    expect(annotationIdOf({ id: "x", customData: { lingrui: true, annotationId: "a1" } })).toBe("a1");
  });
});

describe("elementToAnnotation", () => {
  test("手绘 → draw，并保留几何与样式", () => {
    const a = elementToAnnotation(freehand, { now: () => 1 });
    expect(a.id).toBe("draw-1");
    expect(a.type).toBe("draw");
    expect(a.element).toMatchObject({ x: 10, y: 20, width: 80, height: 40, strokeColor: "#e03131" });
    expect(a.element.points).toHaveLength(2);
    expect(a.provenance).toEqual({ origin: "human", dirty: true, at: 1 });
  });

  test("便签带文字，且 type 识别为 sticky", () => {
    const a = elementToAnnotation({ ...stickyEl, type: "rectangle" }, { text: "幂等要注意" });
    expect(a.type).toBe("shape");
    expect(a.text).toBe("幂等要注意");
  });

  test("重新落盘时保留 attachedTo 与 AI 来源标记", () => {
    const previous: Annotation = {
      id: "draw-1",
      type: "draw",
      attachedTo: "gateway",
      element: { type: "draw", x: 0, y: 0, width: 1, height: 1 },
      provenance: { origin: "ai" },
    };
    const a = elementToAnnotation(freehand, { previous });
    expect(a.attachedTo).toBe("gateway");
    expect(a.provenance.origin).toBe("ai");
  });
});

describe("sameAnnotation（防死循环）", () => {
  const base = elementToAnnotation(freehand);

  test("几何未变视为相同", () => {
    expect(sameAnnotation(base, elementToAnnotation(freehand))).toBe(true);
  });
  test("位置变化视为不同", () => {
    expect(sameAnnotation(base, elementToAnnotation({ ...freehand, x: 30 }))).toBe(false);
  });
  test("文字变化视为不同", () => {
    const withText = { ...base, text: "A" };
    expect(sameAnnotation(withText, { ...base, text: "B" })).toBe(false);
  });
});

describe("annotationToExcalidrawElement", () => {
  test("id 沿用 annotation.id（保证 diffScene 能复用，不重建）", () => {
    const a = elementToAnnotation(freehand);
    const el = annotationToExcalidrawElement(a);
    expect(el.id).toBe("draw-1");
    expect(el.type).toBe("freedraw");
    expect(el.customData).toMatchObject({ lingrui: true, annotationId: "draw-1" });
    expect(el.points).toHaveLength(2);
  });

  test("文本注释带上 text", () => {
    const a: Annotation = {
      id: "t1",
      type: "text",
      element: { type: "text", x: 0, y: 0, width: 100, height: 20 },
      text: "旁注",
      provenance: { origin: "human" },
    };
    expect(annotationToExcalidrawElement(a).text).toBe("旁注");
  });

  test("便签与高亮有固定配色", () => {
    const mk = (type: Annotation["type"]): Annotation => ({
      id: "x",
      type,
      element: { type, x: 0, y: 0, width: 10, height: 10 },
      provenance: { origin: "human" },
    });
    expect(annotationToExcalidrawElement(mk("sticky")).backgroundColor).toBe("#fff7e0");
    expect(annotationToExcalidrawElement(mk("highlight")).strokeColor).toBe("transparent");
  });
});

describe("与 diffScene 协作", () => {
  const asDiffable = (el: Record<string, unknown>): DiffableElement =>
    el as unknown as DiffableElement;

  test("用户新画的元素第一次是 foreign，落盘后变成受管元素", () => {
    const raw = asDiffable({ ...freehand, customData: {} });
    // 还没落盘：diffScene 视为用户手绘，原样保留
    expect(diffScene([raw], []).stats.foreign).toBe(1);

    // 落盘后：它进了 desired，且 id 不变 → 被复用而不是重建
    const managed = asDiffable({ ...freehand, customData: { lingrui: true, annotationId: "draw-1" } });
    const result = diffScene([managed], [asDiffable({ ...managed })]);
    expect(result.stats.reused).toBe(1);
    expect(result.stats.foreign).toBe(0);
  });

  test("注释从 Y.Doc 删除后，场景里也会被移除", () => {
    const managed = asDiffable({ ...freehand, customData: { lingrui: true, annotationId: "draw-1" } });
    expect(diffScene([managed], []).stats.removed).toBe(1);
  });
});

describe("planAnnotationSync（场景 → Y.Doc）", () => {
  const nodeEl = { id: "el-gateway", type: "rectangle", x: 0, y: 0, width: 1, height: 1, customData: { lingrui: true, nodeId: "gateway" } };

  test("用户新画的元素 → upsert", () => {
    const seen = new Set<string>();
    const plan = planAnnotationSync([nodeEl, freehand], [], seen, { now: () => 5 });
    expect(plan.upserts.map((a) => a.id)).toEqual(["draw-1"]);
    expect(plan.removals).toEqual([]);
    expect(seen.has("draw-1")).toBe(true);
  });

  test("节点元素被跳过，不会变成注释", () => {
    const plan = planAnnotationSync([nodeEl], [], new Set());
    expect(plan.upserts).toEqual([]);
  });

  test("几何未变时不重复写（防自激循环）", () => {
    const existing = elementToAnnotation(freehand);
    const plan = planAnnotationSync([freehand], [existing], new Set());
    expect(plan.upserts).toEqual([]);
    expect(plan.removals).toEqual([]);
  });

  test("移动后产生 upsert", () => {
    const existing = elementToAnnotation(freehand);
    const plan = planAnnotationSync([{ ...freehand, x: 999 }], [existing], new Set());
    expect(plan.upserts).toHaveLength(1);
    expect(plan.upserts[0]?.element.x).toBe(999);
  });

  test("场景里消失且曾经出现过 → removal", () => {
    const existing = elementToAnnotation(freehand);
    const seen = new Set(["draw-1"]);
    const plan = planAnnotationSync([nodeEl], [existing], seen);
    expect(plan.removals).toEqual(["draw-1"]);
    expect(seen.has("draw-1")).toBe(false);
  });

  test("刚写入 Y.Doc、还没出现在场景里 → 不误删", () => {
    const justAdded = elementToAnnotation(freehand);
    const seen = new Set<string>(); // 从未在场景里出现过
    const plan = planAnnotationSync([], [justAdded], seen);
    expect(plan.removals).toEqual([]);
  });

  test("便签文字从绑定的 text 子元素取", () => {
    const sticky = { id: "note-1", type: "rectangle", x: 0, y: 0, width: 200, height: 120, customData: {} };
    const label = { id: "note-1-text", type: "text", x: 10, y: 10, width: 100, height: 20, containerId: "note-1", text: "别忘幂等", customData: {} };
    const plan = planAnnotationSync([sticky, label], [], new Set());
    const note = plan.upserts.find((a) => a.id === "note-1");
    expect(note?.text).toBe("别忘幂等");
  });
});
