import { describe, expect, test } from "bun:test";
import * as Y from "yjs";
import { getActivePetId, listPets, readPet, type PetSpec } from "@lingrui/knowledge";
import {
  PET_TOOL_NAMES,
  bodyColorFromText,
  executePetTool,
  paletteFromColor,
  planPet,
} from "./pet-tools";

const imported: PetSpec = {
  id: "clawd",
  name: "Clawd",
  form: "pixel",
  avatar: { kind: "pixel", palette: ["#1e1e1e", "#d97757", "#f0b8a8", "#e5484d", "#ffffff"], seed: 1 },
  personality: { tone: "funny" },
  provenance: { origin: "ai", at: 0 },
  source: { format: "codex-sprite" },
};

describe("executePetTool", () => {
  test("createPet 创建并设为当前宠物", () => {
    const d = new Y.Doc();
    const r = executePetTool(d, { name: "createPet", input: { name: "猫老师" } });
    expect(r.ok).toBe(true);
    expect(r.pet?.name).toBe("猫老师");
    expect(getActivePetId(d)).toBe(r.pet?.id ?? null);
  });

  test("重名会生成唯一 id", () => {
    const d = new Y.Doc();
    const a = executePetTool(d, { name: "createPet", input: { name: "老师" } });
    const b = executePetTool(d, { name: "createPet", input: { name: "老师" } });
    expect(a.pet?.id).not.toBe(b.pet?.id);
    expect(listPets(d).length).toBe(2);
  });

  test("createPet 空名失败", () => {
    const d = new Y.Doc();
    expect(executePetTool(d, { name: "createPet", input: { name: "  " } }).ok).toBe(false);
  });

  test("createPet 从名字里的颜色词取调色板", () => {
    const d = new Y.Doc();
    const r = executePetTool(d, { name: "createPet", input: { name: "蓝色的猫老师" } });
    expect((r.pet?.avatar as { palette: string[] }).palette[1]).toBe("#5b8def");
  });

  test("setPetAppearance 改调色板并标记 human", () => {
    const d = new Y.Doc();
    executePetTool(d, { name: "createPet", input: { name: "老师" } });
    const id = getActivePetId(d)!;
    const r = executePetTool(d, {
      name: "setPetAppearance",
      input: { id, palette: paletteFromColor("#3f9142"), name: "绿老师" },
    });
    expect(r.pet?.name).toBe("绿老师");
    expect(r.pet?.provenance.origin).toBe("human");
    expect(r.pet?.provenance.dirty).toBe(true);
  });

  test("setPetPersonality 改口吻", () => {
    const d = new Y.Doc();
    executePetTool(d, { name: "createPet", input: { name: "老师" } });
    const id = getActivePetId(d)!;
    const r = executePetTool(d, { name: "setPetPersonality", input: { id, tone: "rigorous" } });
    expect(r.pet?.personality.tone).toBe("rigorous");
  });

  test("importPet 导入并激活", () => {
    const d = new Y.Doc();
    const r = executePetTool(d, { name: "importPet", input: { spec: imported } });
    expect(r.ok).toBe(true);
    expect(getActivePetId(d)).toBe("clawd");
    expect(readPet(d, "clawd")?.source?.format).toBe("codex-sprite");
  });

  test("deletePet 删除", () => {
    const d = new Y.Doc();
    executePetTool(d, { name: "createPet", input: { name: "老师" } });
    const id = getActivePetId(d)!;
    expect(executePetTool(d, { name: "deletePet", input: { id } }).ok).toBe(true);
    expect(readPet(d, id)).toBeUndefined();
  });

  test("对不存在的宠物操作返回 ok:false", () => {
    const d = new Y.Doc();
    expect(executePetTool(d, { name: "deletePet", input: { id: "nope" } }).ok).toBe(false);
    expect(
      executePetTool(d, { name: "setPetAppearance", input: { id: "nope", name: "x" } }).ok,
    ).toBe(false);
  });
});

describe("palette + planPet", () => {
  test("paletteFromColor 生成 5 槽", () => {
    const p = paletteFromColor("#5b8def");
    expect(p.length).toBe(5);
    expect(p[0]).toBe("#1e1e1e");
    expect(p[1]).toBe("#5b8def");
    expect(p[4]).toBe("#ffffff");
  });

  test("bodyColorFromText 识别颜色词", () => {
    expect(bodyColorFromText("蓝色的猫")).toBe("#5b8def");
    expect(bodyColorFromText("粉色的狗")).toBe("#ec4899");
    expect(bodyColorFromText("一只宠物")).toBeUndefined();
  });

  test("planPet 命中创建意图", () => {
    const plan = planPet("养一只蓝色的猫老师", { hasPets: false });
    expect(plan.calls.length).toBe(1);
    expect(plan.calls[0]?.name).toBe("createPet");
    expect(plan.reply).toContain("猫老师");
  });

  test("planPet 对无关输入不动作", () => {
    expect(planPet("解释一下网关", { hasPets: false }).calls.length).toBe(0);
  });

  test("PET_TOOLS 名单完整", () => {
    expect(PET_TOOL_NAMES).toContain("createPet");
    expect(PET_TOOL_NAMES.length).toBe(5);
  });
});
