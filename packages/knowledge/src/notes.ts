/**
 * 笔记（多文档）—— PRD/主界面.md §2.3、§5.5
 *
 * 设计取舍：**知识是全局的，笔记是多份的**。
 *   - KnowledgeNode / layout / annotations / chapters 留在 Y.Doc 顶层 root → 一份，
 *     这样「知识库」才能跨笔记索引、画布也是同一张图（PRD/主界面.md §5.5）
 *   - 每篇笔记的正文各占一个 Y.XmlFragment，名字存在 NoteMeta.fragment 里
 *
 * 所以一个 Y.Doc = 一个「工作区」；协同时整个工作区一起同步。
 * 真要做「多工作区」，那是再上一层（多个 Y.Doc / 多个 room），本期不做。
 *
 * 兼容：老数据只有 `document-store` 一个 fragment，所以默认笔记的 fragment 名就是它，
 * 不需要迁移（见 apps/web/src/collab/doc.ts 的 seedDefaultNote）。
 */
import type * as Y from "yjs";
import { ROOT_NOTES, type NoteId, type NoteMeta } from "./schema";

export type { NoteId, NoteMeta };

export function getNotes(doc: Y.Doc): Y.Map<NoteMeta> {
  return doc.getMap<NoteMeta>(ROOT_NOTES);
}

/** 按 order 再按创建时间排的笔记列表 */
export function listNotes(doc: Y.Doc): NoteMeta[] {
  return [...getNotes(doc).values()].sort(
    (a, b) => (a.order ?? 0) - (b.order ?? 0) || a.createdAt - b.createdAt,
  );
}

export function readNote(doc: Y.Doc, id: NoteId): NoteMeta | undefined {
  return getNotes(doc).get(id);
}

export function upsertNote(doc: Y.Doc, note: NoteMeta): void {
  getNotes(doc).set(note.id, note);
}

export function removeNote(doc: Y.Doc, id: NoteId): boolean {
  const notes = getNotes(doc);
  if (!notes.has(id)) return false;
  notes.delete(id);
  return true;
}

/** 改标题（顺带刷新 updatedAt） */
export function renameNote(doc: Y.Doc, id: NoteId, title: string): void {
  const note = readNote(doc, id);
  if (!note) return;
  getNotes(doc).set(id, { ...note, title, updatedAt: Date.now() });
}

/** 新建一篇笔记（调用方负责把它设为当前笔记） */
export function createNote(doc: Y.Doc, title = "未命名笔记"): NoteMeta {
  const id = `note-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4).toString(36)}`;
  const note: NoteMeta = {
    id,
    title,
    fragment: `doc:${id}`,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    order: listNotes(doc).length,
  };
  upsertNote(doc, note);
  return note;
}

/**
 * 取出笔记正文的纯文本（给搜索用）。
 *
 * 这里不去建 BlockNote 编辑器（非当前笔记没有编辑器），直接把 fragment 的
 * XML 序列化后剥标签 —— 够搜索用，且零依赖。
 */
export function noteText(doc: Y.Doc, note: NoteMeta): string {
  try {
    return doc
      .getXmlFragment(note.fragment)
      .toString()
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  } catch {
    return "";
  }
}
