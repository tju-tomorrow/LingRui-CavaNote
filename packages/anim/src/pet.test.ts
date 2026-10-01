import { describe, expect, test } from "bun:test";
import { PET_TO_MASCOT, sampleAt, type SceneScript } from "./scene";

const script: SceneScript = {
  id: "pet",
  title: "t",
  duration: 10,
  actions: [
    { t: 0, kind: "node.spawn", nodeId: "gw", at: [200, 0] },
    { t: 1, kind: "pet.teach", nodeId: "gw", text: "请求先到网关。" },
    { t: 4, kind: "pet.react", to: "celebrate" },
  ],
};

describe("pet.* 教学动作", () => {
  test("pet.teach 行走阶段是 run", () => {
    const s = sampleAt(script, 1.4); // local 0.4 < move 0.9
    expect(s.pet.state).toBe("run");
    expect(s.pet.at[0]).toBeGreaterThan(0);
  });

  test("pet.teach 到位后解释并说旁白", () => {
    const s = sampleAt(script, 3);
    expect(s.pet.state).toBe("explain");
    expect(s.narration?.text).toBe("请求先到网关。");
    expect(s.pet.at).toEqual([200, 0]);
  });

  test("pet.react celebrate", () => {
    expect(sampleAt(script, 5).pet.state).toBe("celebrate");
  });

  test("pet.react aha → think", () => {
    const s = sampleAt(
      { ...script, actions: [{ t: 0, kind: "pet.react", to: "aha" }] },
      1,
    );
    expect(s.pet.state).toBe("think");
  });

  test("pet.say 设置旁白与 explain", () => {
    const s = sampleAt(
      { ...script, actions: [{ t: 0, kind: "pet.say", text: "看这里" }] },
      1,
    );
    expect(s.pet.state).toBe("explain");
    expect(s.narration?.text).toBe("看这里");
  });
});

describe("mascot.* 与 pet 的兼容映射", () => {
  test("mascot.say → pet.explain / mascot.talk", () => {
    const s = sampleAt({ ...script, actions: [{ t: 0, kind: "mascot.say", text: "hi" }] }, 1);
    expect(s.pet.state).toBe("explain");
    expect(s.mascot.state).toBe("talk");
  });

  test("mascot.moveTo 结束后 pet 回到 idle", () => {
    const s = sampleAt(
      {
        ...script,
        actions: [
          { t: 0, kind: "node.spawn", nodeId: "gw", at: [200, 0] },
          { t: 0, kind: "mascot.moveTo", nodeId: "gw" },
        ],
      },
      2,
    );
    expect(s.pet.state).toBe("idle");
    expect(s.mascot.state).toBe("idle");
  });

  test("PET_TO_MASCOT 覆盖 8 个状态", () => {
    expect(Object.keys(PET_TO_MASCOT).length).toBe(8);
  });
});
