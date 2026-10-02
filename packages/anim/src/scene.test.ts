import { describe, expect, test } from "bun:test";
import { sampleAt, type Action, type SceneScript } from "./scene";

const script: SceneScript = {
  id: "s1",
  title: "一次请求的完整旅程",
  duration: 10,
  actions: [
    { t: 0, kind: "node.spawn", nodeId: "user", at: [0, 0] },
    { t: 1, kind: "node.spawn", nodeId: "gateway", at: [200, 0] },
    { t: 2, kind: "edge.connect", from: "user", to: "gateway", label: "HTTP" },
    { t: 3, kind: "flow.send", from: "user", to: "gateway", label: "request" },
    { t: 4, kind: "mascot.moveTo", nodeId: "gateway", state: "run" },
    { t: 5, kind: "node.focus", nodeId: "gateway" },
    { t: 6, kind: "mascot.say", text: "请求先到网关。" },
  ],
};

describe("sampleAt", () => {
  test("t=0 节点刚开始出现（appear=0），0.4s 后完成", () => {
    expect(sampleAt(script, 0).nodes.get("user")?.appear).toBe(0);
    expect(sampleAt(script, 0.4).nodes.get("user")?.appear).toBe(1);
    expect(sampleAt(script, 0).nodes.has("gateway")).toBe(false);
  });

  test("seek 是纯函数：同一 t 结果一致", () => {
    const a = sampleAt(script, 3.5);
    const b = sampleAt(script, 3.5);
    expect([...a.nodes.keys()]).toEqual([...b.nodes.keys()]);
    expect(a.flows.length).toBe(b.flows.length);
  });

  test("t=3.5 数据包正在途中（0<p<1）", () => {
    const s = sampleAt(script, 3.5);
    const flow = s.flows[0];
    expect(flow?.from).toBe("user");
    expect(flow!.progress).toBeGreaterThan(0);
    expect(flow!.progress).toBeLessThan(1);
  });

  test("t=4.5 吉祥物正在跑向 gateway", () => {
    const s = sampleAt(script, 4.5);
    expect(s.mascot.state).toBe("run");
    expect(s.mascot.at[0]).toBeGreaterThan(0);
  });

  test("t=5 移动结束后回到 idle", () => {
    expect(sampleAt(script, 5).mascot.state).toBe("idle");
  });

  test("t=7 focus 与旁白已生效", () => {
    const s = sampleAt(script, 7);
    expect(s.focus).toBe("gateway");
    expect(s.narration?.text).toBe("请求先到网关。");
  });
});

describe("旁白跟随焦点（修复：字幕与聚光灯错位）", () => {
  const actions: Action[] = [
    { t: 0, kind: "node.spawn", nodeId: "a", at: [0, 0] },
    { t: 0, kind: "node.spawn", nodeId: "b", at: [300, 0] },
    { t: 1, kind: "node.focus", nodeId: "a" },
    { t: 2, kind: "mascot.say", text: "这是 A" },
    { t: 5, kind: "node.focus", nodeId: "b" },
  ];
  const script: SceneScript = { id: "narration", title: "旁白测试", duration: 10, actions };

  test("讲到 A 时旁白挂在 A 上", () => {
    const s = sampleAt(script, 3);
    expect(s.narration?.text).toBe("这是 A");
    expect(s.narration?.nodeId).toBe("a");
  });

  test("镜头移到 B 后旧旁白必须清掉（不能还挂着 A）", () => {
    const s = sampleAt(script, 6);
    expect(s.focus).toBe("b");
    expect(s.narration).toBeNull();
  });

  test("到 B 之后新说的旁白挂到 B 上", () => {
    const withSay: Action[] = [...actions, { t: 7, kind: "mascot.say", text: "这是 B" }];
    const s = sampleAt({ id: "narration2", title: "旁白测试", duration: 10, actions: withSay }, 8);
    expect(s.narration?.text).toBe("这是 B");
    expect(s.narration?.nodeId).toBe("b");
  });
});
