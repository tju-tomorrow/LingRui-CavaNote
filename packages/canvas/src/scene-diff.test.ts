import { describe, expect, test } from "bun:test";
import { diffScene, elementIdentity, elementSignature, type DiffableElement } from "./scene-diff";

function rect(id: string, nodeId: string, x = 0, y = 0): DiffableElement {
  return {
    id,
    type: "rectangle",
    x,
    y,
    width: 250,
    height: 96,
    customData: { lingrui: true, nodeId },
  };
}

function label(containerId: string, text: string, x = 0, y = 0): DiffableElement {
  return { id: `random-${Math.random()}`, type: "text", x, y, width: 100, height: 20, containerId, text, customData: { lingrui: true } };
}

function arrow(id: string, from: string, to: string, w = 70): DiffableElement {
  return {
    id,
    type: "arrow",
    x: 0,
    y: 0,
    width: w,
    height: 0,
    startBinding: { elementId: from },
    endBinding: { elementId: to },
    customData: { lingrui: true },
  };
}

function foreign(id: string): DiffableElement {
  return { id, type: "ellipse", x: 5, y: 5, width: 10, height: 10, customData: {} };
}

describe("elementIdentity", () => {
  test("标签用容器 id 作为身份（因为它的 id 每次都是随机的）", () => {
    expect(elementIdentity(label("el-a", "A"))).toBe("label:el-a");
  });
  test("容器/箭头用自己的 id", () => {
    expect(elementIdentity(rect("el-a", "a"))).toBe("el-a");
  });
});

describe("elementSignature", () => {
  test("位置变化会改变指纹", () => {
    expect(elementSignature(rect("el-a", "a", 0, 0))).not.toBe(elementSignature(rect("el-a", "a", 10, 0)));
  });
  test("标题变化会改变标签指纹", () => {
    expect(elementSignature(label("el-a", "旧"))).not.toBe(elementSignature(label("el-a", "新")));
  });
  test("忽略随机的 id", () => {
    expect(elementSignature(label("el-a", "同"))).toBe(elementSignature(label("el-a", "同")));
  });
});

describe("diffScene", () => {
  test("首次渲染：全部新增，且保留用户手绘", () => {
    const desired = [rect("el-a", "a"), label("el-a", "A")];
    const current = [foreign("hand-1")];

    const { elements, stats } = diffScene(current, desired);
    expect(stats).toMatchObject({ added: 2, changed: 0, reused: 0, removed: 0, foreign: 1 });
    expect(elements).toHaveLength(3);
    expect(elements.some((e) => e.id === "hand-1")).toBe(true);
  });

  test("内容没变时复用原对象（最小改动）", () => {
    const prevRect = rect("el-a", "a");
    const prevLabel = label("el-a", "A");
    const current = [prevRect, prevLabel];

    const { elements, stats } = diffScene(current, [rect("el-a", "a"), label("el-a", "A")]);
    expect(stats.reused).toBe(2);
    // 复用的是同一个对象引用，标签的随机 id 因此被保住
    expect(elements).toContain(prevLabel);
    expect(elements.find((e) => e.type === "text")?.id).toBe(prevLabel.id);
  });

  test("标题变了只替换标签，不重建容器", () => {
    const prevRect = rect("el-a", "a");
    const prevLabel = label("el-a", "旧标题");
    const current = [prevRect, prevLabel];

    const { elements, stats } = diffScene(current, [rect("el-a", "a"), label("el-a", "新标题")]);
    expect(stats).toMatchObject({ added: 0, changed: 1, reused: 1 });
    expect(elements).toContain(prevRect);
    expect(elements.find((e) => e.type === "text")?.text).toBe("新标题");
  });

  test("节点移动：容器与连线都换，标签跟随", () => {
    const current = [rect("el-a", "a", 0, 0), rect("el-b", "b", 300, 0), arrow("edge-el-a-el-b", "el-a", "el-b", 50)];

    const { stats } = diffScene(current, [
      rect("el-a", "a", 0, 200),
      rect("el-b", "b", 300, 0),
      arrow("edge-el-a-el-b", "el-a", "el-b", 30),
    ]);
    expect(stats.changed).toBe(2);
    expect(stats.reused).toBe(1);
  });

  test("节点被删：它的元素不再出现在结果里，但用户手绘还在", () => {
    const current = [rect("el-a", "a"), label("el-a", "A"), foreign("hand-1")];

    const { elements, stats } = diffScene(current, []);
    expect(stats.removed).toBe(2);
    expect(elements).toHaveLength(1);
    expect(elements[0]?.id).toBe("hand-1");
  });

  test("删除节点不会误删用户手绘", () => {
    const current = [rect("el-a", "a"), foreign("hand-1"), foreign("hand-2")];
    const { elements } = diffScene(current, []);
    expect(elements.map((e) => e.id).sort()).toEqual(["hand-1", "hand-2"]);
  });
});
