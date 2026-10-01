/**
 * 编辑器 schema —— 在 BlockNote 默认块之外加上"知识卡片"块
 */
import { BlockNoteSchema, defaultBlockSpecs } from "@blocknote/core";
import { knowledgeCard } from "./knowledgeCard";

export const schema = BlockNoteSchema.create({
  blockSpecs: {
    ...defaultBlockSpecs,
    knowledgeCard: knowledgeCard(),
  },
});
