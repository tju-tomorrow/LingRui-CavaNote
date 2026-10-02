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

/**
 * 幂等 upsert：确保该节点在文档里有一张知识卡片，返回它的块 id。
 *
 * 幂等靠 `nodeId` 做键：卡片只存 nodeId、标题实时从 Y.Doc 读，
 * 所以"更新"就是什么都不用做（不存在重复写的问题）。
 * 见 PRD/主界面.md §5.3。
 */
export function upsertNodeCard(nodeId: string): string | undefined {
  if (!editor) return undefined;

  const existing = findCardBlock(nodeId);
  if (existing) return existing.id;

  insertKnowledgeCard(nodeId);
  return findCardBlock(nodeId)?.id;
}

/** 文档里所有已落盘的节点 id（供"哪些节点还没有正文"判断） */
export function documentedNodeIds(): string[] {
  if (!editor) return [];
  const out: string[] = [];
  for (const block of editor.document) {
    if (block.type !== "knowledgeCard") continue;
    const nodeId = (block.props as { nodeId?: string }).nodeId;
    if (nodeId) out.push(nodeId);
  }
  return out;
}

/**
 * 移除某个节点的知识卡片（节点被删后清理孤儿卡片）。
 *
 * 为什么需要它：我们的 UndoManager 不管 BlockNote 的文档 fragment，
 * 所以撤销一轮 AI 改动后卡片会留下，指向一个不存在的节点。
 */
export function removeKnowledgeCard(nodeId: string): boolean {
  if (!editor) return false;
  const block = findCardBlock(nodeId);
  if (!block) return false;
  editor.removeBlocks([block.id]);
  return true;
}

/**
 * 在文档末尾追加一个段落 —— Agent 扩展笔记用。
 *
 * 返回是否真的写入（编辑器未就绪 / 空文本 → false）。
 */
export function appendNoteParagraph(text: string): boolean {
  if (!editor) return false;
  const content = text.trim();
  if (!content) return false;
  const blocks = editor.document;
  const last = blocks[blocks.length - 1];
  const block = { type: "paragraph" as const, content };
  if (last) editor.insertBlocks([block], last.id, "after");
  else if (blocks[0]) editor.insertBlocks([block], blocks[0].id, "before");
  else return false;
  return true;
}

/**
 * 在文档末尾插入一个「概念画布」嵌入块 —— Agent 新建概念画布时用。
 * 块只存 canvasId，点它就把右侧画布切过去。
 */
export function insertCanvasEmbed(canvasId: string): boolean {
  if (!editor || !canvasId) return false;
  const blocks = editor.document;
  const last = blocks[blocks.length - 1];
  const block = { type: "canvasEmbed" as const, props: { canvasId } };
  if (last) editor.insertBlocks([block], last.id, "after");
  else if (blocks[0]) editor.insertBlocks([block], blocks[0].id, "before");
  else return false;
  return true;
}

/**
 * 文档正文 → Markdown（导出用）。
 *
 * 自定义块（knowledgeCard）由 BlockNote 尽力转换；没有该 API 时返回空串，
 * 调用方据此只导出知识节点部分。
 */
export async function docToMarkdown(): Promise<string> {
  if (!editor) return "";
  const withMd = editor as AnyEditor & {
    blocksToMarkdownLossy?: (blocks: unknown) => Promise<string>;
  };
  if (typeof withMd.blocksToMarkdownLossy !== "function") return "";
  try {
    return await withMd.blocksToMarkdownLossy(editor.document);
  } catch {
    return "";
  }
}

/** 从内联内容里取纯文本（递归拿 text 节点） */
function inlineText(content: unknown): string {
  if (!Array.isArray(content)) return "";
  return content
    .map((c) => {
      const node = c as { text?: unknown; content?: unknown };
      if (typeof node.text === "string") return node.text;
      if (Array.isArray(node.content)) return inlineText(node.content);
      return "";
    })
    .join("")
    .trim();
}

export interface OutlineItem {
  level: number;
  title: string;
  /** 该标题下的第一段正文（做旁白用） */
  body: string;
}

/**
 * 当前文档的「标题大纲」—— 供「根据笔记生成画布」把笔记结构变成流程图。
 *
 * 只取标题 + 每个标题下的第一段，避免把整篇笔记拆成一堆碎节点。
 */
export function noteOutline(): OutlineItem[] {
  if (!editor) return [];
  const out: OutlineItem[] = [];
  let current: OutlineItem | null = null;
  for (const block of editor.document) {
    if (block.type === "heading") {
      const level = (block.props as { level?: number }).level ?? 1;
      const title = inlineText(block.content);
      if (!title) continue;
      current = { level, title, body: "" };
      out.push(current);
    } else if (current && !current.body) {
      if (
        block.type === "paragraph" ||
        block.type === "bulletListItem" ||
        block.type === "numberedListItem"
      ) {
        const text = inlineText(block.content);
        if (text) current.body = text;
      }
    }
  }
  return out;
}
