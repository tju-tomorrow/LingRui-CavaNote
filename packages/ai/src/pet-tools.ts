/**
 * @lingrui/ai — Personal Pet 工具（见 `PRD/宠物.md` §6）
 *
 * 与 `CANVAS_TOOLS` 同构：AI 调用，executor 落到 Y.Doc。
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
/**
 * 宠物工具表。
 * params 与 CANVAS_TOOLS 同构：直接作为 OpenAI function parameters 发给模型。
 * 不给 schema 时模型会自己编字段名（实测），所以每个都必须写清。
 */
export const PET_TOOLS = {
  createPet: {
    description: "创建一只属于用户的宠物（讲解老师），并设为当前宠物",
    when: "当用户想养一只新宠物 / 想要一个讲解伙伴时",
    params: {
      type: "object",
      required: ["name"],
      properties: {
        id: { type: "string", description: "省略则由名字生成" },
        name: { type: "string", description: "宠物名字，如「猫老师」" },
        form: { type: "string", enum: ["pixel", "vrm", "ascii"], description: "默认 pixel" },
        palette: {
          type: "array",
          items: { type: "string" },
          description: "主色调（hex），如 [\"#5b8def\", \"#8fb8ff\"]",
        },
        seed: { type: "number", description: "像素形象随机种子" },
        tone: { type: "string", description: "讲解口吻，如 friendly / rigorous / funny" },
      },
    },
  },
  setPetAppearance: {
    description: "修改宠物的外观：名字、调色板、像素缩放",
    when: "当用户想换皮 / 改名 / 换颜色时",
    params: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string", description: "宠物 id" },
        name: { type: "string" },
        palette: { type: "array", items: { type: "string" } },
        seed: { type: "number" },
        scale: { type: "number" },
      },
    },
  },
  setPetPersonality: {
    description: "修改宠物的讲解口吻与语言",
    when: "当用户想换语气 / 风格时",
    params: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string" },
        tone: { type: "string", description: "friendly / rigorous / funny…" },
        lang: { type: "string", description: "语言，如 zh-CN" },
      },
    },
  },
  importPet: {
    description: "导入外部宠物规格（Codex sprite / Petdex）",
    when: "当用户想用现成宠物时",
    params: {
      type: "object",
      required: ["spec"],
      properties: {
        spec: {
          type: "object",
          required: ["id", "name"],
          properties: {
            id: { type: "string" },
            name: { type: "string" },
            form: { type: "string", enum: ["pixel", "vrm", "ascii"] },
            palette: { type: "array", items: { type: "string" } },
            source: { type: "object", description: "来源标记（gallery / format）" },
          },
        },
      },
    },
  },
  deletePet: {
    description: "删除某只宠物",
    when: "当用户不要某只宠物时",
    params: {
      type: "object",
      required: ["id"],
      properties: { id: { type: "string" } },
    },
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

/** 把 LLM / planner 的工具调用转成可执行形状（参数校验在 executePetTool 里） */
export function toPetToolCall(name: string, input: unknown): PetToolCall | { error: string } {
  if (!PET_TOOL_NAMES.includes(name as PetToolName)) {
    return { error: `未知宠物工具：${name}` };
  }
  return { name: name as PetToolName, input } as PetToolCall;
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

export { DEFAULT_PET };
