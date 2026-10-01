/**
 * 编辑器桥 —— 让非 React 层（聊天、画布）能操作文档
 *
 * 这是"文档块 ↔ 节点"双向绑定的另一半：
 *   - 画布点节点 → revealNode() 把文档滚到对应的知识卡片
 *   - 聊天"插入到笔记" → insertKnowledgeCard() 落盘成块
 */
import type { BlockNoteEditor } from "@blocknote/core";

// schema 是自定义的，这里用宽泛类型避免把泛型参数铺满整个应用
type AnyEditor = BlockNoteEditor<any, any, any>;

let editor: AnyEditor | null = null;

export function registerEditor(next: AnyEditor | null): void {
  editor = next;
}

function findCardBlock(nodeId: string) {
  if (!editor) return undefined;
  return editor.document.find(
    (b) => b.type === "knowledgeCard" && (b.props as { nodeId?: string }).nodeId === nodeId,
  );
}

/**
 * 在文档里滚动到某个节点的知识卡片；找不到就返回 false。
 *
 * 刻意不用 editor.setTextCursorPosition——那会把 DOM 焦点从画布抢走，
 * 正在拖节点时体验会很差。这里只做视觉滚动 + 短暂高亮。
 */
export function revealNode(nodeId: string): boolean {
  const block = findCardBlock(nodeId);
  if (!block) return false;

  const el = document.querySelector(`[data-id="${block.id}"]`);
  if (!el) return false;
  el.scrollIntoView({ block: "center", behavior: "smooth" });
  el.classList.add("knowledge-card-flash");
  window.setTimeout(() => el.classList.remove("knowledge-card-flash"), 1200);
  return true;
}

/** 把某个节点落盘成一张知识卡片，插在文档末尾 */
export function insertKnowledgeCard(nodeId: string): boolean {
  if (!editor) return false;
  if (findCardBlock(nodeId)) return false;

  const blocks = editor.document;
  const last = blocks[blocks.length - 1];
  const reference = last?.id;

  const card = { type: "knowledgeCard" as const, props: { nodeId } };
  if (reference) {
    editor.insertBlocks([card], reference, "after");
  } else {
    editor.insertBlocks([card], editor.document[0]!.id, "before");
  }
  return true;
}
