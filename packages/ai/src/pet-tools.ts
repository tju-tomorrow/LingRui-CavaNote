/**
 * @lingrui/ai — Personal Pet 工具（见 `PRD/宠物.md` §6）
 *
 * 与 `CANVAS_TOOLS` 同构：AI（或本地 planner）调用，executor 落到 Y.Doc。
 * 这里只动 `@lingrui/knowledge` 的 pet root，不碰画布。
 */
import type * as Y from "yjs";
import {
  DEFAULT_PET,
  readPet,
  removePet,
  setActivePet,
  upsertPet,
  type PetAvatar,
  type PetForm,
  type PetId,
  type PetSpec,
} from "@lingrui/knowledge";

/** 工具描述表：给 LLM 看的能力清单 */
export const PET_TOOLS = {
  createPet: {
    description: "创建一只属于用户的宠物（讲解老师），并设为当前宠物",
    when: "当用户想养一只新宠物 / 想要一个讲解伙伴时",
  },
  setPetAppearance: {
    description: "修改宠物的外观：名字、调色板、像素缩放",
    when: "当用户想换皮 / 改名 / 换颜色时",
  },
  setPetPersonality: {
    description: "修改宠物的讲解口吻与语言",
    when: "当用户想换语气 / 风格时",
  },
  importPet: {
    description: "导入外部宠物规格（Codex sprite / Petdex）",
    when: "当用户想用现成宠物时",
  },
  deletePet: {
    description: "删除某只宠物",
    when: "当用户不要某只宠物时",
  },
} as const;

export type PetToolName = keyof typeof PET_TOOLS;
export const PET_TOOL_NAMES = Object.keys(PET_TOOLS) as PetToolName[];

// ---------------------------------------------------------------------------
// 入参
// ---------------------------------------------------------------------------

export interface CreatePetInput {
  id?: PetId;
  name: string;
  form?: PetForm;
  palette?: string[];
  seed?: number;
  tone?: string;
}

export interface SetPetAppearanceInput {
  id: PetId;
  name?: string;
  palette?: string[];
  seed?: number;
  scale?: number;
}

export interface SetPetPersonalityInput {
  id: PetId;
  tone?: string;
  lang?: string;
}

export interface ImportPetInput {
  spec: PetSpec;
}

export interface DeletePetInput {
  id: PetId;
}

export type PetToolCall =
  | { name: "createPet"; input: CreatePetInput }
  | { name: "setPetAppearance"; input: SetPetAppearanceInput }
  | { name: "setPetPersonality"; input: SetPetPersonalityInput }
  | { name: "importPet"; input: ImportPetInput }
  | { name: "deletePet"; input: DeletePetInput };

export interface PetToolResult {
  ok: boolean;
  message: string;
  pet?: PetSpec;
}

// ---------------------------------------------------------------------------
// 调色板工具
// ---------------------------------------------------------------------------

/** 默认调色板：描边 / 身体 / 肚皮 / 强调 / 白 */
export const DEFAULT_PALETTE = ["#1e1e1e", "#d97757", "#f0b8a8", "#e5484d", "#ffffff"];

const COLOR_WORDS: Record<string, string> = {
  红: "#e5484d",
  橙: "#d97757",
  黄: "#f5c542",
  绿: "#3f9142",
  蓝: "#5b8def",
  青: "#06b6d4",
  紫: "#8b5cf6",
  粉: "#ec4899",
  白: "#f2f2f2",
  黑: "#2b2b2b",
  灰: "#9ca3af",
};

function clamp255(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function lighten(hex: string, amount = 0.4): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m?.[1]) return hex;
  const num = parseInt(m[1], 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  const mix = (c: number) => clamp255(c + (255 - c) * amount);
  return `#${((mix(r) << 16) | (mix(g) << 8) | mix(b)).toString(16).padStart(6, "0")}`;
}

/** 由主色构造 5 槽调色板 */
export function paletteFromColor(body: string): string[] {
  return ["#1e1e1e", body, lighten(body), "#e5484d", "#ffffff"];
}

/** 从文本里找颜色词 → 主色 */
export function bodyColorFromText(text: string): string | undefined {
  for (const [word, hex] of Object.entries(COLOR_WORDS)) {
    if (text.includes(word)) return hex;
  }
  return undefined;
}

function slug(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 24) || "pet"
  );
}

/** 去掉口语前缀/量词，留下名字本体 */
function cleanName(s: string): string {
  return s
    .replace(/^(养|创建|生成|添加|加|来|给我|做|要|画)/, "")
    .replace(/^(一只|一个|一条|只|个)/, "")
    .replace(/^的/, "")
    .trim();
}

function pixelAvatar(palette: string[], seed: number): PetAvatar {
  return { kind: "pixel", palette, seed, scale: 4 };
}

// ---------------------------------------------------------------------------
// 执行
// ---------------------------------------------------------------------------

export function executePetTool(doc: Y.Doc, call: PetToolCall): PetToolResult {
  switch (call.name) {
    case "createPet":
      return createPet(doc, call.input);
    case "setPetAppearance":
      return setPetAppearance(doc, call.input);
    case "setPetPersonality":
      return setPetPersonality(doc, call.input);
    case "importPet":
      return importPet(doc, call.input);
    case "deletePet":
      return deletePet(doc, call.input);
  }
}

function createPet(doc: Y.Doc, input: CreatePetInput): PetToolResult {
  const name = input.name?.trim();
  if (!name) return { ok: false, message: "createPet 需要非空 name" };

  let id = input.id?.trim() || slug(name);
  let n = 1;
  while (readPet(doc, id)) id = `${slug(name)}-${++n}`;

  const palette = input.palette?.length ? input.palette : paletteFromColor(bodyColorFromText(name) ?? DEFAULT_PALETTE[1]!);
  const spec: PetSpec = {
    id,
    name,
    form: input.form ?? "pixel",
    avatar: pixelAvatar(palette, input.seed ?? Date.now() % 97),
    personality: { tone: input.tone ?? "friendly", lang: "zh" },
    provenance: { origin: "ai", at: Date.now() },
  };
  upsertPet(doc, spec);
  setActivePet(doc, id);
  return { ok: true, message: `已创建宠物「${name}」，现在是你的讲解老师。`, pet: spec };
}

function setPetAppearance(doc: Y.Doc, input: SetPetAppearanceInput): PetToolResult {
  const pet = readPet(doc, input.id);
  if (!pet) return { ok: false, message: `宠物不存在：${input.id}` };

  const avatar = { ...pet.avatar } as PetAvatar;
  if (avatar.kind === "pixel") {
    if (input.palette?.length) avatar.palette = input.palette;
    if (typeof input.seed === "number") avatar.seed = input.seed;
    if (typeof input.scale === "number") avatar.scale = input.scale;
  }
  const next: PetSpec = {
    ...pet,
    name: input.name?.trim() || pet.name,
    avatar,
    provenance: { origin: "human", dirty: true, at: Date.now() },
  };
  upsertPet(doc, next);
  return { ok: true, message: `已更新「${next.name}」的外观。`, pet: next };
}

function setPetPersonality(doc: Y.Doc, input: SetPetPersonalityInput): PetToolResult {
  const pet = readPet(doc, input.id);
  if (!pet) return { ok: false, message: `宠物不存在：${input.id}` };
  const next: PetSpec = {
    ...pet,
    personality: { tone: input.tone ?? pet.personality.tone, lang: input.lang ?? pet.personality.lang },
    provenance: { origin: "human", dirty: true, at: Date.now() },
  };
  upsertPet(doc, next);
  return { ok: true, message: `已把「${next.name}」的讲解口吻调成 ${next.personality.tone}。`, pet: next };
}

function importPet(doc: Y.Doc, input: ImportPetInput): PetToolResult {
  const spec = input.spec;
  if (!spec?.id || !spec.name) return { ok: false, message: "importPet 需要合法 spec（id + name）" };
  upsertPet(doc, { ...spec, source: spec.source ?? { format: "codex-sprite" } });
  setActivePet(doc, spec.id);
  return { ok: true, message: `已导入宠物「${spec.name}」。`, pet: spec };
}

function deletePet(doc: Y.Doc, input: DeletePetInput): PetToolResult {
  if (!readPet(doc, input.id)) return { ok: false, message: `宠物不存在：${input.id}` };
  removePet(doc, input.id);
  return { ok: true, message: `已删除宠物 ${input.id}。` };
}

// ---------------------------------------------------------------------------
// 本地 planner（无 LLM 时的降级路径，与 canvas planner 同思路）
// ---------------------------------------------------------------------------

export interface PetPlan {
  calls: PetToolCall[];
  reply: string;
}

/** "养一只蓝色的猫老师" → createPet */
export function planPet(message: string, ctx: { hasPets: boolean }): PetPlan {
  const text = message.trim();
  if (!text) return { calls: [], reply: "" };

  const wantsPet = /(宠物|养|老师|伙伴|伴读)/.test(text);
  if (!wantsPet) return { calls: [], reply: "" };

  const named = /叫\s*([^\s，。,.!！?？的]+)/.exec(text)?.[1]?.trim();
  const color = bodyColorFromText(text);

  // 优先“…的X老师/宠物/伙伴”里的 X
  let derived: string | undefined;
  const m = /([^\s，。,.!！?？]{1,6})(老师|宠物|伙伴|伴读)/.exec(text);
  if (m?.[1] && m[2]) {
    const base = cleanName(m[1].split("的").pop() ?? "");
    derived = `${base || m[2]}`;
    if (base && !derived.includes(m[2])) derived = `${base}${m[2]}`;
  }

  const name = named ?? derived ?? (color ? "老师宠" : "老师宠");

  const call: PetToolCall = {
    name: "createPet",
    input: { name, ...(color ? { palette: paletteFromColor(color) } : {}) },
  };
  return {
    calls: [call],
    reply: ctx.hasPets
      ? `好的，我又养了一只「${name}」当你的老师。`
      : `好，我养了一只「${name}」当你的讲解老师。`,
  };
}

export { DEFAULT_PET };
