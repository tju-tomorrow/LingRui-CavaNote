import { describe, expect, test } from "bun:test";
import { DEFAULT_NODE_SIZE, inferKind } from "./planner";

describe("inferKind", () => {
  test("按关键词识别基建类型", () => {
    expect(inferKind("加一个 Kafka")).toBe("queue");
    expect(inferKind("postgres")).toBe("database");
    expect(inferKind("Nginx 网关")).toBe("gateway");
    expect(inferKind("随便什么")).toBe("concept");
  });
});

describe("DEFAULT_NODE_SIZE", () => {
  test("节点默认尺寸是正数", () => {
    expect(DEFAULT_NODE_SIZE.width).toBeGreaterThan(0);
    expect(DEFAULT_NODE_SIZE.height).toBeGreaterThan(0);
  });
});
