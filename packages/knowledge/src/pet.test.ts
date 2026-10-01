import { describe, expect, test } from "bun:test";
import * as Y from "yjs";
import {
  DEFAULT_PET,
  ensureDefaultPet,
  getActivePet,
  getActivePetId,
  listPets,
  readPet,
  removePet,
  setActivePet,
  upsertPet,
  type PetSpec,
} from "./pet";

function doc(): Y.Doc {
  return new Y.Doc();
}

const cat: PetSpec = {
  id: "cat",
  name: "猫老师",
  form: "pixel",
  avatar: { kind: "pixel", palette: ["#1e1e1e", "#5b8def", "#c7d7ff", "#e5484d", "#ffffff"], seed: 3 },
  personality: { tone: "friendly", lang: "zh" },
  provenance: { origin: "ai", at: 1 },
};

describe("pet store", () => {
  test("空文档 ensureDefaultPet 播种默认宠物并激活", () => {
    const d = doc();
    const pet = ensureDefaultPet(d);
    expect(pet.id).toBe(DEFAULT_PET.id);
    expect(getActivePetId(d)).toBe(DEFAULT_PET.id);
    expect(listPets(d).length).toBe(1);
  });

  test("已有宠物时 ensureDefaultPet 不重复播种", () => {
    const d = doc();
    upsertPet(d, cat);
    const pet = ensureDefaultPet(d);
    expect(pet.id).toBe("cat");
    expect(listPets(d).length).toBe(1);
  });

  test("upsert 后 read/list 生效", () => {
    const d = doc();
    upsertPet(d, cat);
    expect(readPet(d, "cat")?.name).toBe("猫老师");
    expect(listPets(d).map((p) => p.id)).toEqual(["cat"]);
  });

  test("首个宠物自动成为 active", () => {
    const d = doc();
    upsertPet(d, cat);
    expect(getActivePetId(d)).toBe("cat");
  });

  test("setActivePet 对不存在的宠物返回 false", () => {
    const d = doc();
    upsertPet(d, cat);
    expect(setActivePet(d, "nope")).toBe(false);
    expect(getActivePetId(d)).toBe("cat");
  });

  test("删除 active 宠物会自动切到剩余的第一只", () => {
    const d = doc();
    upsertPet(d, cat);
    upsertPet(d, { ...DEFAULT_PET, id: "p2", name: "灵睿二号" });
    setActivePet(d, "p2");
    removePet(d, "p2");
    expect(getActivePetId(d)).toBe("cat");
    expect(getActivePet(d)?.id).toBe("cat");
  });

  test("删除最后一只宠物后 active 清空", () => {
    const d = doc();
    upsertPet(d, cat);
    removePet(d, "cat");
    expect(getActivePetId(d)).toBe(null);
    expect(listPets(d).length).toBe(0);
  });
});
