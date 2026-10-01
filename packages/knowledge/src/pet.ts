/**
 * @lingrui/knowledge — Personal Pet 模型
 *
 * 见 `PRD/宠物.md`。宠物是 per-user 的"我的"资产；这里定义它的规格与 Y.Doc 存储。
 * 视觉渲染在 `@lingrui/mascot`，AI 工具在 `@lingrui/ai`。
 *
 * 不变量：宠物只存**引用**（调色板 / 资产路径），不把精灵图塞进 Y.Doc。
 */
import * as Y from "yjs";
import type { Provenance } from "./schema";

// ---------------------------------------------------------------------------
// 类型
// ---------------------------------------------------------------------------

export type PetId = string;

/** 形态：像素优先，VRM / ASCII 为高级/极简形态 */
export type PetForm = "pixel" | "vrm" | "ascii";

/** 教学状态机（见 PRD/宠物.md §5） */
export type PetState =
  | "idle"
  | "think"
  | "explain"
  | "point"
  | "run"
  | "celebrate"
  | "confused"
  | "sleep";

export const PET_STATES: readonly PetState[] = [
  "idle",
  "think",
  "explain",
  "point",
  "run",
  "celebrate",
  "confused",
  "sleep",
] as const;

/** 像素形态：由调色板 + 种子程序化生成各状态帧（无需外部资产） */
export interface PixelAvatar {
  kind: "pixel";
  /** [outline, body, belly, accent, white] 的十六进制色 */
  palette: string[];
  /** 程序化变体种子 */
  seed: number;
  /** 每像素放大倍数 */
  scale?: number;
}

export interface VrmAvatar {
  kind: "vrm";
  asset: string;
}

export interface AsciiAvatar {
  kind: "ascii";
  art: string[];
}

export type PetAvatar = PixelAvatar | VrmAvatar | AsciiAvatar;

export interface PetPersonality {
  tone: string; // "friendly" | "rigorous" | "funny" | 自定义
  lang?: string; // "zh" | "en" …
}

export interface PetVoice {
  tts?: string;
  pitch?: number;
  speed?: number;
}

export interface PetSpec {
  id: PetId;
  name: string;
  form: PetForm;
  avatar: PetAvatar;
  personality: PetPersonality;
  voice?: PetVoice;
  ownerId?: string;
  provenance: Provenance;
  /** 导入来源（Petdex / Codex sprite…） */
  source?: { gallery?: string; format?: "codex-sprite" | "native" };
}

// ---------------------------------------------------------------------------
// Y.Doc schema
// ---------------------------------------------------------------------------

export const ROOT_PETS = "pets";
export const ROOT_ACTIVE_PET = "activePet";

export function getPets(doc: Y.Doc): Y.Map<PetSpec> {
  return doc.getMap<PetSpec>(ROOT_PETS);
}

function getActiveMap(doc: Y.Doc): Y.Map<{ id: PetId }> {
  return doc.getMap<{ id: PetId }>(ROOT_ACTIVE_PET);
}

export function listPets(doc: Y.Doc): PetSpec[] {
  return [...getPets(doc).values()];
}

export function readPet(doc: Y.Doc, id: PetId): PetSpec | undefined {
  return getPets(doc).get(id);
}

export function upsertPet(doc: Y.Doc, spec: PetSpec): void {
  doc.transact(() => {
    getPets(doc).set(spec.id, spec);
    if (!getActiveMap(doc).get("current")) getActiveMap(doc).set("current", { id: spec.id });
  });
}

export function removePet(doc: Y.Doc, id: PetId): void {
  doc.transact(() => {
    getPets(doc).delete(id);
    if (getActivePetId(doc) === id) {
      const next = listPets(doc)[0];
      if (next) getActiveMap(doc).set("current", { id: next.id });
      else getActiveMap(doc).delete("current");
    }
  });
}

export function getActivePetId(doc: Y.Doc): PetId | null {
  return getActiveMap(doc).get("current")?.id ?? null;
}

export function setActivePet(doc: Y.Doc, id: PetId): boolean {
  if (!readPet(doc, id)) return false;
  getActiveMap(doc).set("current", { id });
  return true;
}

export function getActivePet(doc: Y.Doc): PetSpec | undefined {
  const id = getActivePetId(doc);
  return id ? readPet(doc, id) : undefined;
}

/** 默认宠物：灵睿（像素珊瑚色小生物，风格对齐参考图） */
export const DEFAULT_PET: PetSpec = {
  id: "lingrui",
  name: "灵睿",
  form: "pixel",
  avatar: {
    kind: "pixel",
    palette: ["#1e1e1e", "#d97757", "#f0b8a8", "#e5484d", "#ffffff"],
    seed: 7,
    scale: 4,
  },
  personality: { tone: "friendly", lang: "zh" },
  provenance: { origin: "ai", at: 0 },
};

/** 没有任何宠物时播种默认宠物，返回当前激活宠物 */
export function ensureDefaultPet(doc: Y.Doc): PetSpec {
  const active = getActivePet(doc);
  if (active) return active;
  upsertPet(doc, DEFAULT_PET);
  return DEFAULT_PET;
}
