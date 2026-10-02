import { describe, expect, test } from "bun:test";
import {
  applyNoulRank,
  buildNoulRerank,
  rerankByNoul,
  type SystemOneAnswer,
  type SystemOneAsk,
} from "./systemone";

const answer = (noul: number): SystemOneAnswer => ({ type: "noul", noul });

describe("buildNoulRerank", () => {
  test("一句话一个候选，key 与候选下标对齐", () => {
    const { state, questions } = buildNoulRerank(
      "Kafka 怎么保证不丢消息",
      ["Producer 的 acks=all", "Redis 过期策略"],
      (s) => s,
      (i) => `片段 ${i} 相关吗`,
    );
    expect(state).toContain("Kafka 怎么保证不丢消息");
    expect(state).toContain("[c0] Producer 的 acks=all");
    expect(state).toContain("[c1] Redis 过期策略");
    expect(Object.keys(questions)).toEqual(["c0", "c1"]);
    expect(questions.c0?.type).toBe("noul");
  });
});

describe("applyNoulRank", () => {
  const pool = ["a", "b", "c"];

  test("低于阈值的一条不留，按概率降序", () => {
    const kept = applyNoulRank(pool, { c0: answer(0.3), c1: answer(0.9), c2: answer(0.6) });
    expect(kept.map((k) => k.item)).toEqual(["b", "c"]);
    expect(kept.map((k) => k.noul)).toEqual([0.9, 0.6]);
  });

  test("全是垃圾 → 空数组（不硬凑）", () => {
    const kept = applyNoulRank(pool, { c0: answer(0.1), c1: answer(0.2), c2: answer(0.4) });
    expect(kept).toEqual([]);
  });

  test("缺答案 / 类型不对 → 当没通过", () => {
    const kept = applyNoulRank(pool, { c0: answer(0.9), c1: { type: "choice", choice: "x", confidence: 1, probabilities: {} } });
    expect(kept.map((k) => k.item)).toEqual(["a"]);
  });
});

describe("rerankByNoul（fail-open）", () => {
  const pool = ["a", "b"];

  test("成功：返回排好序的候选", async () => {
    const ask: SystemOneAsk = async () => ({ answers: { c0: answer(0.2), c1: answer(0.95) } });
    const res = await rerankByNoul("q", pool, (s) => s, ask);
    expect(res?.map((r) => r.item)).toEqual(["b"]);
  });

  test("调用失败 → null（调用方退回原顺序，而不是变空）", async () => {
    const ask: SystemOneAsk = async () => {
      throw new Error("boom");
    };
    expect(await rerankByNoul("q", pool, (s) => s, ask)).toBeNull();
  });

  test("空候选 → null", async () => {
    const ask: SystemOneAsk = async () => ({ answers: {} });
    expect(await rerankByNoul("q", [], (s: string) => s, ask)).toBeNull();
  });
});
