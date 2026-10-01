import { describe, expect, test } from "bun:test";
import { relationToArrow, type Rect } from "./excalidraw-binding";

const A: Rect = { x: 0, y: 0, width: 250, height: 96 };
const B: Rect = { x: 320, y: 0, width: 250, height: 96 };
const C: Rect = { x: 0, y: 220, width: 250, height: 96 };

describe("relationToArrow", () => {
  test("水平方向：从 A 右边界到 B 左边界", () => {
    const arrow = relationToArrow({ elementId: "el-a", rect: A }, { elementId: "el-b", rect: B });
    expect(arrow.x).toBe(250);
    expect(arrow.y).toBe(48);
    expect(arrow.width).toBe(70);
    expect(arrow.height).toBe(0);
    expect(arrow.points).toEqual([
      [0, 0],
      [70, 0],
    ]);
  });

  test("垂直方向：从 A 下边界到 C 上边界", () => {
    const arrow = relationToArrow({ elementId: "el-a", rect: A }, { elementId: "el-c", rect: C });
    expect(arrow.x).toBe(125);
    expect(arrow.y).toBe(96);
    expect(arrow.height).toBe(124);
    expect(arrow.points).toEqual([
      [0, 0],
      [0, 124],
    ]);
  });

  test("id 与绑定都是确定的，便于重建场景", () => {
    const arrow = relationToArrow({ elementId: "el-a", rect: A }, { elementId: "el-b", rect: B });
    expect(arrow.id).toBe("edge-el-a-el-b");
    expect(arrow.start).toEqual({ id: "el-a" });
    expect(arrow.end).toEqual({ id: "el-b" });
  });

  test("保留 label 与 lingrui 标记", () => {
    const arrow = relationToArrow(
      { elementId: "el-a", rect: A },
      { elementId: "el-b", rect: B },
      "HTTP",
    );
    expect(arrow.label).toEqual({ text: "HTTP", fontSize: 14 });
    expect(arrow.customData).toEqual({ lingrui: true, kind: "relation" });
  });
});
