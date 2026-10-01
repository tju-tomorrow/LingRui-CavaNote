import { describe, expect, test } from "bun:test";
import { deriveShots, shotAt } from "./shots";
import type { Action } from "./scene";

const actions: Action[] = [
  { t: 0, kind: "node.spawn", nodeId: "user", at: [0, 0] },
  { t: 1, kind: "node.spawn", nodeId: "gateway", at: [320, 0] },
  { t: 2, kind: "mascot.moveTo", nodeId: "gateway" },
  { t: 3, kind: "node.focus", nodeId: "user" },
  { t: 4, kind: "edge.connect", from: "user", to: "gateway" },
];

describe("deriveShots", () => {
  test("按节点首次出现切分，去重且有序", () => {
    const shots = deriveShots(actions, (id) => (id === "gateway" ? "API 网关" : id));
    expect(shots.map((s) => s.id)).toEqual(["shot-user", "shot-gateway"]);
    expect(shots.map((s) => s.startT)).toEqual([0, 1]);
    expect(shots[1]?.title).toBe("API 网关");
  });

  test("无标题解析时回退 nodeId", () => {
    expect(deriveShots(actions)[1]?.title).toBe("gateway");
  });

  test("没有节点动作则无分镜", () => {
    expect(deriveShots([{ t: 0, kind: "edge.connect", from: "a", to: "b" }]).length).toBe(0);
  });
});

describe("shotAt", () => {
  const shots = deriveShots(actions);
  test("落在正确的分镜内", () => {
    expect(shotAt(shots, 0.5)?.id).toBe("shot-user");
    expect(shotAt(shots, 1.5)?.id).toBe("shot-gateway");
    expect(shotAt(shots, 9)?.id).toBe("shot-gateway");
  });
});
