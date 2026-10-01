import { describe, expect, test } from "bun:test";
import { PET_TOOLS } from "./pet-tools";
import { CANVAS_TOOLS, toCanvasToolCall } from "./tools";

/** 联合类型不能直接断言成 Record，绕一下 unknown */
const asRecord = (input: unknown): Record<string, unknown> => input as Record<string, unknown>;

/**
 * 这组测试守的是一个真实事故：工具 schema 没发给模型时，
 * 模型会自己编字段名（`type` 而不是 `kind`、`x/y` 而不是 `at`），
 * 而 executor 不做形状校验 → 会静默生成坏节点（kind 为空、坐标 NaN）。
 */
describe("toCanvasToolCall 入参归一化", () => {
  test("spawnNode：type → kind，x/y → at", () => {
    const call = toCanvasToolCall("spawnNode", {
      id: "kafka",
      title: "Kafka 消息队列",
      type: "messaging",
      x: -320,
      y: 220,
    });
    if ("error" in call) throw new Error(call.error);
    expect(call.name).toBe("spawnNode");
    expect(call.input).toMatchObject({
      id: "kafka",
      title: "Kafka 消息队列",
      kind: "queue", // messaging 是模型自造词，要归一到 queue
      at: [-320, 220],
    });
    expect(asRecord(call.input).type).toBeUndefined();
    expect(asRecord(call.input).x).toBeUndefined();
  });

  test("spawnNode：合法 kind 原样保留", () => {
    const call = toCanvasToolCall("spawnNode", {
      id: "db",
      kind: "database",
      title: "数据库",
      at: [0, 0],
    });
    if ("error" in call) throw new Error(call.error);
    expect(asRecord(call.input).kind).toBe("database");
  });

  test("spawnNode：认不出的 kind 退化成 concept（不能留坏值）", () => {
    const call = toCanvasToolCall("spawnNode", {
      id: "x",
      kind: "某种不存在的东西",
      title: "X",
      at: [0, 0],
    });
    if ("error" in call) throw new Error(call.error);
    expect(asRecord(call.input).kind).toBe("concept");
  });

  test("updateNode：type → kind", () => {
    const call = toCanvasToolCall("updateNode", { id: "kafka", type: "db" });
    if ("error" in call) throw new Error(call.error);
    expect(asRecord(call.input).kind).toBe("database");
  });

  test("updateNode：认不出的 kind 被丢弃（不能把节点误改成 concept）", () => {
    const call = toCanvasToolCall("updateNode", { id: "kafka", kind: "胡说八道" });
    if ("error" in call) throw new Error(call.error);
    expect(asRecord(call.input).kind).toBeUndefined();
  });

  test("updateNode：没给 kind 就不注入（否则会把原类型覆盖掉）", () => {
    const call = toCanvasToolCall("updateNode", { id: "kafka", title: "新标题" });
    if ("error" in call) throw new Error(call.error);
    expect(asRecord(call.input).kind).toBeUndefined();
  });

  test("connect：source/target/relation 别名 + 非法关系退化 calls", () => {
    const call = toCanvasToolCall("connect", {
      source: "service",
      target: "kafka",
      relation: "publishes messages",
    });
    if ("error" in call) throw new Error(call.error);
    expect(call.input).toMatchObject({ from: "service", to: "kafka", kind: "publishes" });
  });

  test("connect：合法关系原样保留", () => {
    const call = toCanvasToolCall("connect", { from: "a", to: "b", kind: "reads" });
    if ("error" in call) throw new Error(call.error);
    expect(asRecord(call.input).kind).toBe("reads");
  });

  test("focus：id → nodeId", () => {
    const call = toCanvasToolCall("focus", { id: "gateway" });
    if ("error" in call) throw new Error(call.error);
    expect(call.input).toEqual({ nodeId: "gateway" });
  });

  test("未知工具被拒绝", () => {
    expect(toCanvasToolCall("teleport", {})).toMatchObject({ error: expect.stringContaining("未知工具") });
  });
});

describe("工具表都带 JSON schema", () => {
  test("画布工具每个都有 params.properties", () => {
    for (const [name, spec] of Object.entries(CANVAS_TOOLS)) {
      const params = (spec as { params?: { properties?: unknown } }).params;
      expect(params, `${name} 缺 params`).toBeDefined();
      expect(params?.properties, `${name} 缺 params.properties`).toBeDefined();
    }
  });

  test("宠物工具每个都有 params.properties", () => {
    for (const [name, spec] of Object.entries(PET_TOOLS)) {
      const params = (spec as { params?: { properties?: unknown } }).params;
      expect(params, `${name} 缺 params`).toBeDefined();
      expect(params?.properties, `${name} 缺 params.properties`).toBeDefined();
    }
  });

  test("spawnNode 的 kind 是 enum，且包含 queue", () => {
    const kind = (
      CANVAS_TOOLS.spawnNode.params.properties as Record<string, { enum?: readonly string[] }>
    ).kind;
    expect(kind?.enum).toContain("queue");
  });
});
