import { describe, expect, test } from "bun:test";
import type { KnowledgeNode } from "@lingrui/knowledge";
import { freeSlot, inferKind, plan } from "./planner";

function node(id: string, kind: KnowledgeNode["kind"], title: string): KnowledgeNode {
  return { id, kind, title, relations: [] };
}

const NODES: KnowledgeNode[] = [
  node("user", "client", "用户"),
  node("gateway", "gateway", "API 网关"),
  node("redis", "cache", "Redis 缓存"),
];

describe("inferKind", () => {
  test("按关键词识别基建类型", () => {
    expect(inferKind("加一个 Kafka")).toBe("queue");
    expect(inferKind("postgres")).toBe("database");
    expect(inferKind("Nginx 网关")).toBe("gateway");
    expect(inferKind("随便什么")).toBe("concept");
  });
});

describe("freeSlot", () => {
  test("放在已有节点右侧，避免重叠", () => {
    expect(freeSlot([{ x: 0, y: 0 }, { x: 320, y: 0 }])).toEqual([640, 0]);
  });
  test("空画布从原点开始", () => {
    expect(freeSlot([])).toEqual([0, 0]);
  });
});

describe("plan", () => {
  test("“添加 X” 产出 spawnNode", () => {
    const p = plan("添加一个 Kafka", { t: 0, nodes: NODES, occupied: [{ x: 0, y: 0 }] });
    expect(p.calls).toHaveLength(1);
    expect(p.calls[0]).toMatchObject({
      name: "spawnNode",
      input: { kind: "queue", at: [320, 0] },
    });
    expect(p.reply).toContain("Kafka");
  });

  test("口语量词不会跑进标题", () => {
    const p = plan("添加一个 Kafka 消息队列", { t: 0, nodes: NODES, occupied: [] });
    const call = p.calls[0];
    expect(call?.name).toBe("spawnNode");
    if (call?.name === "spawnNode") {
      expect(call.input.title).toBe("Kafka 消息队列");
      expect(call.input.title.startsWith("一个")).toBe(false);
    }
  });

  test("提到已有节点 → focus + 旁白", () => {
    const p = plan("解释一下 Redis 缓存是干嘛的", { t: 0, nodes: NODES, occupied: [] });
    expect(p.calls.map((c) => c.name)).toEqual(["focus", "narrate"]);
  });

  test("提到链路上没有的类型 → 自动补节点并聚焦", () => {
    const p = plan("消息队列在这里干什么", { t: 0, nodes: NODES, occupied: [] });
    expect(p.calls.map((c) => c.name)).toEqual(["spawnNode", "focus"]);
    expect(p.reply).toContain("消息队列");
  });

  test("已经存在的类型不会重复添加", () => {
    const p = plan("缓存是怎么工作的", { t: 0, nodes: NODES, occupied: [] });
    // 命中已有节点 redis 的标题，走 focus 分支
    expect(p.calls.map((c) => c.name)).toEqual(["focus", "narrate"]);
  });

  test("无关问题不产生工具调用（交给默认讲解）", () => {
    const p = plan("你好呀", { t: 0, nodes: NODES, occupied: [] });
    expect(p.calls).toEqual([]);
    expect(p.reply).toBe("");
  });
});
