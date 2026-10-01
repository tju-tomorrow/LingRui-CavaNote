import { describe, expect, test } from "bun:test";
import {
  LOCAL_USER,
  annotationsOf,
  createKnowledgeDoc,
  listChapters,
  listProgress,
  readAnnotation,
  readProgress,
  removeAnnotation,
  serializeScene,
  setProgress,
  summarizeSnapshot,
  upsertAnnotation,
  upsertChapter,
  upsertNode,
  type Annotation,
  type KnowledgeNode,
} from "./index";

function doc() {
  return createKnowledgeDoc({ id: "t", title: "测试" });
}

function node(id: string, title: string, extra: Partial<KnowledgeNode> = {}): KnowledgeNode {
  return { id, kind: "service", title, relations: [], ...extra };
}

function sticky(id: string, attachedTo?: string): Annotation {
  return {
    id,
    type: "sticky",
    attachedTo,
    text: "这里要注意幂等",
    element: { type: "sticky", x: 10, y: 20, width: 200, height: 120 },
    provenance: { origin: "human" },
  };
}

describe("Annotation CRUD", () => {
  test("往返：写入后能按 id 读回", () => {
    const d = doc();
    upsertAnnotation(d, sticky("a1", "gateway"));
    const back = readAnnotation(d, "a1");
    expect(back?.text).toBe("这里要注意幂等");
    expect(back?.attachedTo).toBe("gateway");
    expect(back?.provenance.origin).toBe("human");
  });

  test("按节点反查注释", () => {
    const d = doc();
    upsertAnnotation(d, sticky("a1", "gateway"));
    upsertAnnotation(d, sticky("a2", "gateway"));
    upsertAnnotation(d, sticky("a3"));
    expect(annotationsOf(d, "gateway").map((a) => a.id).sort()).toEqual(["a1", "a2"]);
    expect(annotationsOf(d, "redis")).toEqual([]);
  });

  test("删除返回是否真的删掉了", () => {
    const d = doc();
    upsertAnnotation(d, sticky("a1"));
    expect(removeAnnotation(d, "a1")).toBe(true);
    expect(removeAnnotation(d, "a1")).toBe(false);
    expect(readAnnotation(d, "a1")).toBeUndefined();
  });

  test("注释与节点互不干扰（两类一等实体并列）", () => {
    const d = doc();
    upsertNode(d, node("gateway", "网关"));
    upsertAnnotation(d, sticky("a1", "gateway"));
    removeAnnotation(d, "a1");
    expect(d.getMap("nodes").get("gateway")).toBeDefined();
  });
});

describe("Chapter", () => {
  test("按 order 排序，且同 id 覆盖不重复", () => {
    const d = doc();
    upsertChapter(d, { id: "c2", title: "第二幕", order: 2 });
    upsertChapter(d, { id: "c1", title: "第一幕", order: 1, startT: 0 });
    expect(listChapters(d).map((c) => c.id)).toEqual(["c1", "c2"]);

    upsertChapter(d, { id: "c1", title: "第一幕（改名）", order: 1 });
    expect(listChapters(d).length).toBe(2);
    expect(listChapters(d)[0]?.title).toBe("第一幕（改名）");
  });
});

describe("Progress 按 userId 分桶", () => {
  test("不同用户互不覆盖", () => {
    const d = doc();
    setProgress(d, "gateway", "done", "u1");
    setProgress(d, "gateway", "learning", "u2");

    expect(readProgress(d, "gateway", "u1")?.state).toBe("done");
    expect(readProgress(d, "gateway", "u2")?.state).toBe("learning");
    expect(readProgress(d, "gateway", LOCAL_USER)).toBeUndefined();
  });

  test("同用户重复写覆盖", () => {
    const d = doc();
    setProgress(d, "gateway", "todo");
    setProgress(d, "gateway", "done");
    expect(readProgress(d, "gateway")?.state).toBe("done");
    expect(listProgress(d)["gateway"]?.state).toBe("done");
  });
});

describe("serializeScene → CanvasSnapshot", () => {
  const viewport = { scrollX: 0, scrollY: 0, zoom: 1, width: 800, height: 600 };

  test("节点/关系/注释/章节都被带上，且与 viewport 同版本", () => {
    const d = doc();
    upsertNode(d, node("gateway", "网关", { roles: ["统一入口"], provenance: { origin: "human" } }));
    upsertNode(d, node("service", "服务", { relations: [{ id: "r1", to: "gateway", kind: "calls", label: "路由" }] }));
    upsertAnnotation(d, sticky("a1", "gateway"));
    upsertChapter(d, { id: "c1", title: "第一幕", order: 1 });

    const snap = serializeScene(d, { version: 7, viewport, focus: "gateway", now: () => 123 });

    expect(snap.version).toBe(7);
    expect(snap.viewport).toEqual(viewport);
    expect(snap.capturedAt).toBe(123);
    expect(snap.focus).toBe("gateway");
    expect(snap.nodes.map((n) => n.id)).toEqual(["gateway", "service"]);
    expect(snap.nodes[0]).toMatchObject({ at: [0, 0], size: [250, 96], roles: ["统一入口"] });
    expect(snap.relations).toEqual([{ from: "service", to: "gateway", kind: "calls", label: "路由" }]);
    expect(snap.annotations[0]).toMatchObject({ id: "a1", bbox: [10, 20, 200, 120], attachedTo: "gateway" });
    expect(snap.chapters.map((c) => c.id)).toEqual(["c1"]);
  });

  test("layout 覆盖默认坐标", () => {
    const d = doc();
    upsertNode(d, node("a", "A"));
    d.getMap("layout").set("a", { x: 640, y: 120 });
    const snap = serializeScene(d, { version: 1, viewport });
    expect(snap.nodes[0]?.at).toEqual([640, 120]);
  });

  test("空文档也能序列化（旧数据零迁移）", () => {
    const snap = serializeScene(doc(), { version: 1, viewport });
    expect(snap.nodes).toEqual([]);
    expect(snap.relations).toEqual([]);
    expect(snap.annotations).toEqual([]);
    expect(snap.chapters).toEqual([]);
  });

  test("summarizeSnapshot 给出人可读摘要", () => {
    const d = doc();
    upsertNode(d, node("a", "A", { provenance: { origin: "human" } }));
    upsertNode(d, node("b", "B"));
    upsertAnnotation(d, sticky("a1"));
    const text = summarizeSnapshot(serializeScene(d, { version: 3, viewport }));
    expect(text).toContain("v3");
    expect(text).toContain("2 节点");
    expect(text).toContain("人改过 1");
    expect(text).toContain("1 注释");
  });
});

describe("字段兼容（v1 新增字段全可选）", () => {
  test("旧节点（无新字段）可直接参与快照", () => {
    const d = doc();
    const legacy: KnowledgeNode = { id: "old", kind: "cache", title: "老节点", relations: [] };
    upsertNode(d, legacy);
    const snap = serializeScene(d, { version: 1, viewport: { scrollX: 0, scrollY: 0, zoom: 1, width: 1, height: 1 } });
    expect(snap.nodes[0]?.roles).toBeUndefined();
    expect(snap.nodes[0]?.provenance).toBeUndefined();
  });
});
