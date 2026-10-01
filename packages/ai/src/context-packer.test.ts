import { describe, expect, test } from "bun:test";
import {
  createKnowledgeDoc,
  upsertAnnotation,
  upsertChapter,
  upsertNode,
  type KnowledgeNode,
} from "@lingrui/knowledge";
import { freezeContext, snapshotToPrompt } from "./context-packer";

const viewport = { scrollX: 0, scrollY: 0, zoom: 1, width: 800, height: 600 };

function node(id: string, title: string, extra: Partial<KnowledgeNode> = {}): KnowledgeNode {
  return { id, kind: "service", title, relations: [], ...extra };
}

function buildDoc() {
  const doc = createKnowledgeDoc({ id: "t", title: "测试" });
  upsertNode(
    doc,
    node("gateway", "API 网关", {
      roles: ["统一入口", "鉴权限流"],
      provenance: { origin: "human" },
    }),
  );
  upsertNode(doc, node("service", "后端服务", { relations: [{ id: "r1", to: "gateway", kind: "calls", label: "路由" }] }));
  upsertAnnotation(doc, {
    id: "a1",
    type: "sticky",
    attachedTo: "gateway",
    text: "别忘幂等",
    element: { type: "sticky", x: 10, y: 20, width: 200, height: 120 },
    provenance: { origin: "human" },
  });
  upsertChapter(doc, { id: "c1", title: "请求进入网关", order: 1, startT: 0 });
  return doc;
}

describe("freezeContext", () => {
  test("截图与数据共用同一个 version（不漂移）", () => {
    const frozen = freezeContext(buildDoc(), {
      version: 12,
      viewport,
      focus: "gateway",
      screenshot: "data:image/png;base64,AAAA",
      now: () => 999,
    });
    expect(frozen.version).toBe(12);
    expect(frozen.snapshot.version).toBe(12);
    expect(frozen.snapshot.capturedAt).toBe(999);
    expect(frozen.screenshot).toBe("data:image/png;base64,AAAA");
  });

  test("截图缺失也能冻结（截图失败不应阻塞回灌）", () => {
    const frozen = freezeContext(buildDoc(), { version: 1, viewport });
    expect(frozen.snapshot.nodes).toHaveLength(2);
    expect(frozen.screenshot).toBeUndefined();
  });
});

describe("snapshotToPrompt", () => {
  const text = snapshotToPrompt(
    freezeContext(buildDoc(), { version: 7, viewport, focus: "gateway" }).snapshot,
  );

  test("带版本与 viewport", () => {
    expect(text).toContain("画布版本 v7");
    expect(text).toContain("zoom=1.00");
  });

  test("节点带可寻址 id、坐标、尺寸、要点、来源标记", () => {
    expect(text).toContain("id=gateway kind=service「API 网关」");
    expect(text).toContain("at=(0,0) size=250x96");
    expect(text).toContain("要点=统一入口 / 鉴权限流");
    expect(text).toContain("[人改过]");
  });

  test("关系与标注（含 bbox，便于像素↔id 对齐）", () => {
    expect(text).toContain("service → gateway (calls)「路由」");
    expect(text).toContain('id=a1 type=sticky attachedTo=gateway text="别忘幂等"');
    expect(text).toContain("bbox=(10,20,200,120)");
  });

  test("章节与当前聚焦", () => {
    expect(text).toContain("「请求进入网关」order=1 startT=0s");
    expect(text).toContain("当前聚焦：gateway");
  });

  test("带上了权限规则（不删人改过的元素）", () => {
    expect(text).toContain("不要删除 [人改过] / origin=human 的元素");
  });

  test("空画布也能生成（不抛错）", () => {
    const empty = createKnowledgeDoc({ id: "e", title: "空" });
    const out = snapshotToPrompt(freezeContext(empty, { version: 1, viewport }).snapshot);
    expect(out).toContain("节点（0）");
  });
});
