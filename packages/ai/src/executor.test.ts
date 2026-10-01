import { describe, expect, test } from "bun:test";
import { createKnowledgeDoc, getLayout, markHuman, readNode } from "@lingrui/knowledge";
import { applyPending, executeTool, summarizeRisk, type ToolContext } from "./executor";

function ctx(): ToolContext {
  return { doc: createKnowledgeDoc({ id: "t", title: "test" }), t: 0 };
}

describe("executeTool / spawnNode", () => {
  test("写入 Knowledge 并产出 node.spawn 动作", () => {
    const c = ctx();
    const r = executeTool(c, {
      name: "spawnNode",
      input: { id: "kafka", kind: "queue", title: "Kafka", at: [900, 0] },
    });

    expect(r.ok).toBe(true);
    expect(r.actions).toEqual([{ t: 0, kind: "node.spawn", nodeId: "kafka", at: [900, 0] }]);
    expect(readNode(c.doc, "kafka")?.kind).toBe("queue");
    expect(readNode(c.doc, "kafka")?.title).toBe("Kafka");
  });

  test("重复 spawn 同一个 id 不会丢已有关系", () => {
    const c = ctx();
    executeTool(c, { name: "spawnNode", input: { id: "a", kind: "service", title: "A", at: [0, 0] } });
    executeTool(c, { name: "spawnNode", input: { id: "b", kind: "cache", title: "B", at: [1, 0] } });
    executeTool(c, { name: "connect", input: { from: "a", to: "b", kind: "reads" } });

    executeTool(c, { name: "spawnNode", input: { id: "a", kind: "service", title: "A2", at: [0, 0] } });

    const a = readNode(c.doc, "a");
    expect(a?.title).toBe("A2");
    expect(a?.relations).toHaveLength(1);
  });

  test("缺少必填字段时失败且不写库", () => {
    const c = ctx();
    const r = executeTool(c, { name: "spawnNode", input: { id: "", kind: "service", title: "X", at: [0, 0] } });
    expect(r.ok).toBe(false);
    expect(r.actions).toEqual([]);
  });
});

describe("executeTool / connect", () => {
  test("建立关系并产出 edge.connect", () => {
    const c = ctx();
    executeTool(c, { name: "spawnNode", input: { id: "gw", kind: "gateway", title: "网关", at: [0, 0] } });
    executeTool(c, { name: "spawnNode", input: { id: "svc", kind: "service", title: "服务", at: [1, 0] } });

    const r = executeTool(c, {
      name: "connect",
      input: { from: "gw", to: "svc", kind: "calls", label: "路由" },
    });

    expect(r.ok).toBe(true);
    expect(r.actions[0]).toMatchObject({ kind: "edge.connect", from: "gw", to: "svc" });
    expect(readNode(c.doc, "gw")?.relations[0]).toMatchObject({ to: "svc", kind: "calls", label: "路由" });
  });

  test("重复连接是幂等的", () => {
    const c = ctx();
    executeTool(c, { name: "spawnNode", input: { id: "a", kind: "service", title: "A", at: [0, 0] } });
    executeTool(c, { name: "spawnNode", input: { id: "b", kind: "service", title: "B", at: [1, 0] } });
    executeTool(c, { name: "connect", input: { from: "a", to: "b", kind: "calls" } });
    executeTool(c, { name: "connect", input: { from: "a", to: "b", kind: "calls" } });
    expect(readNode(c.doc, "a")?.relations).toHaveLength(1);
  });

  test("端点不存在时失败", () => {
    const c = ctx();
    executeTool(c, { name: "spawnNode", input: { id: "a", kind: "service", title: "A", at: [0, 0] } });
    expect(executeTool(c, { name: "connect", input: { from: "a", to: "ghost", kind: "calls" } }).ok).toBe(false);
    expect(executeTool(c, { name: "connect", input: { from: "a", to: "a", kind: "calls" } }).ok).toBe(false);
  });
});

describe("executeTool / focus & narrate", () => {
  test("focus 同时驱动镜头和吉祥物移动", () => {
    const c = { ...ctx(), t: 3 };
    executeTool(c, { name: "spawnNode", input: { id: "redis", kind: "cache", title: "Redis", at: [10, 0] } });
    const r = executeTool(c, { name: "focus", input: { nodeId: "redis" } });
    expect(r.ok).toBe(true);
    expect(r.actions).toEqual([
      { t: 3, kind: "node.focus", nodeId: "redis" },
      { t: 3, kind: "mascot.moveTo", nodeId: "redis", state: "run" },
    ]);
  });

  test("focus 不存在的节点会失败", () => {
    const c = ctx();
    expect(executeTool(c, { name: "focus", input: { nodeId: "ghost" } }).ok).toBe(false);
  });

  test("narrate 产出 mascot.say", () => {
    const c = { ...ctx(), t: 5 };
    const r = executeTool(c, { name: "narrate", input: { text: "请求先到网关。" } });
    expect(r.ok).toBe(true);
    expect(r.actions).toEqual([{ t: 5, kind: "mascot.say", text: "请求先到网关。" }]);
  });
});

describe("executeTool / flow", () => {
  test("端点齐备时产出 flow.send", () => {
    const c = ctx();
    executeTool(c, { name: "spawnNode", input: { id: "a", kind: "client", title: "用户", at: [0, 0] } });
    executeTool(c, { name: "spawnNode", input: { id: "b", kind: "gateway", title: "网关", at: [1, 0] } });
    const r = executeTool(c, { name: "flow", input: { from: "a", to: "b", label: "HTTP" } });
    expect(r.ok).toBe(true);
    expect(r.actions[0]).toMatchObject({ kind: "flow.send", from: "a", to: "b", label: "HTTP" });
  });

  test("端点缺失时失败", () => {
    const c = ctx();
    executeTool(c, { name: "spawnNode", input: { id: "a", kind: "client", title: "用户", at: [0, 0] } });
    expect(executeTool(c, { name: "flow", input: { from: "a", to: "ghost" } }).ok).toBe(false);
  });
});

describe("provenance 与三级保险（ADR-0011）", () => {
  test("AI 生成的节点标 origin=ai", () => {
    const c = ctx();
    executeTool(c, { name: "spawnNode", input: { id: "a", kind: "service", title: "A", at: [0, 0] } });
    expect(readNode(c.doc, "a")?.provenance?.origin).toBe("ai");
  });

  test("人改过的节点：AI 覆盖会先挂起，不直接应用", () => {
    const c = ctx();
    executeTool(c, { name: "spawnNode", input: { id: "a", kind: "service", title: "A", at: [0, 0] } });
    markHuman(c.doc, "a");

    const r = executeTool(c, { name: "updateNode", input: { id: "a", title: "被 AI 改了" } });

    expect(r.applied).toBe(false);
    expect(r.risk).toBe("mutate");
    expect(r.pending?.call.name).toBe("updateNode");
    expect(readNode(c.doc, "a")?.title).toBe("A"); // 没被改
  });

  test("确认后 applyPending 才真正写入", () => {
    const c = ctx();
    executeTool(c, { name: "spawnNode", input: { id: "a", kind: "service", title: "A", at: [0, 0] } });
    markHuman(c.doc, "a");

    const held = executeTool(c, { name: "updateNode", input: { id: "a", title: "新标题" } });
    const applied = applyPending(c, held.pending!.call);

    expect(applied.applied).toBe(true);
    expect(readNode(c.doc, "a")?.title).toBe("新标题");
    expect(readNode(c.doc, "a")?.provenance?.origin).toBe("ai");
  });

  test("删除人的元素要确认；确认后连带清理指向它的关系", () => {
    const c = ctx();
    executeTool(c, { name: "spawnNode", input: { id: "hub", kind: "service", title: "Hub", at: [0, 0] } });
    executeTool(c, { name: "spawnNode", input: { id: "leaf", kind: "cache", title: "Leaf", at: [1, 0] } });
    executeTool(c, { name: "connect", input: { from: "hub", to: "leaf", kind: "reads" } });
    markHuman(c.doc, "leaf");

    const held = executeTool(c, { name: "deleteNode", input: { id: "leaf" } });
    expect(held.applied).toBe(false);
    expect(held.risk).toBe("destructive");
    expect(readNode(c.doc, "leaf")).toBeDefined();

    applyPending(c, held.pending!.call);
    expect(readNode(c.doc, "leaf")).toBeUndefined();
    expect(readNode(c.doc, "hub")?.relations).toHaveLength(0);
  });

  test("删除 AI 自己的节点无需确认，并产出 node.remove", () => {
    const c = ctx();
    executeTool(c, { name: "spawnNode", input: { id: "a", kind: "service", title: "A", at: [0, 0] } });
    const r = executeTool(c, { name: "deleteNode", input: { id: "a" } });
    expect(r.applied).toBe(true);
    expect(r.actions[0]).toMatchObject({ kind: "node.remove", nodeId: "a" });
    expect(readNode(c.doc, "a")).toBeUndefined();
  });

  test("moveNode 写入 layout", () => {
    const c = ctx();
    executeTool(c, { name: "spawnNode", input: { id: "a", kind: "service", title: "A", at: [0, 0] } });
    executeTool(c, { name: "moveNode", input: { id: "a", x: 777, y: 555 } });
    expect(getLayout(c.doc).get("a")).toEqual({ x: 777, y: 555 });
  });

  test("disconnect 移除关系，缺失时失败", () => {
    const c = ctx();
    executeTool(c, { name: "spawnNode", input: { id: "a", kind: "service", title: "A", at: [0, 0] } });
    executeTool(c, { name: "spawnNode", input: { id: "b", kind: "cache", title: "B", at: [1, 0] } });
    executeTool(c, { name: "connect", input: { from: "a", to: "b", kind: "reads" } });

    expect(executeTool(c, { name: "disconnect", input: { from: "a", to: "b" } }).ok).toBe(true);
    expect(readNode(c.doc, "a")?.relations).toHaveLength(0);
    expect(executeTool(c, { name: "disconnect", input: { from: "a", to: "b" } }).ok).toBe(false);
  });

  test("summarizeRisk 取最高风险且只算未应用的", () => {
    const c = ctx();
    executeTool(c, { name: "spawnNode", input: { id: "a", kind: "service", title: "A", at: [0, 0] } });
    const add = executeTool(c, { name: "spawnNode", input: { id: "b", kind: "cache", title: "B", at: [1, 0] } });
    expect(summarizeRisk([add])).toBe("add");

    markHuman(c.doc, "a");
    const held = executeTool(c, { name: "deleteNode", input: { id: "a" } });
    expect(summarizeRisk([add, held])).toBe("destructive");
  });
});

describe("spawnNode 的坐标必须落到 layout（回归）", () => {
  test("不写 layout 会导致新节点堆在原点 (0,0)", () => {
    const c = ctx();
    executeTool(c, {
      name: "spawnNode",
      input: { id: "kafka", kind: "queue", title: "Kafka", at: [1340, 40] },
    });
    // 曾经只产出动画动作、不写 layout，画布回退到默认 (0,0)
    expect(getLayout(c.doc).get("kafka")).toEqual({ x: 1340, y: 40 });
  });

  test("AI 生成在原点时也显式写入，避免与默认布局混淆", () => {
    const c = ctx();
    executeTool(c, { name: "spawnNode", input: { id: "a", kind: "service", title: "A", at: [0, 0] } });
    expect(getLayout(c.doc).get("a")).toEqual({ x: 0, y: 0 });
  });
});
