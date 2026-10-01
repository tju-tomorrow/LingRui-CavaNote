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

/**
 * 删笔记（连带清空它的正文 fragment）。
 *
 * 只摘 notes 元信息是不够的：Y.XmlFragment 是 Y.Doc 的**顶层 root**，
 * 元信息没了它还在 —— 每个客户端和 Postgres 快照里都会永久留着那篇正文。
 * 所以这里显式把内容删掉（Yjs 的删除是墓碑，仍然可被 undo 恢复）。
 */
export function removeNote(doc: Y.Doc, id: NoteId): boolean {
  const notes = getNotes(doc);
  const note = notes.get(id);
  if (!note) return false;

  doc.transact(() => {
    notes.delete(id);
    if (note.fragment) {
      const fragment = doc.getXmlFragment(note.fragment);
      if (fragment.length > 0) fragment.delete(0, fragment.length);
    }
  });
  return true;
}

/** 改标题（顺带刷新 updatedAt） */
export function renameNote(doc: Y.Doc, id: NoteId, title: string): void {
  const note = readNote(doc, id);
  if (!note) return;
  getNotes(doc).set(id, { ...note, title, updatedAt: Date.now() });
}

function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4).toString(36)}`;
}

/** 新建一篇笔记（调用方负责把它设为当前笔记） */
export function createNote(
  doc: Y.Doc,
  title = "未命名笔记",
  parentId: string | null = null,
): NoteMeta {
  const id = newId("note");
  const note: NoteMeta = {
    id,
    title,
    fragment: `doc:${id}`,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    order: siblingsOf(doc, parentId).length,
    parentId,
  };
  upsertNote(doc, note);
  return note;
}

/** 新建一个分组（文件夹）——只有名字，没有正文 */
export function createFolder(
  doc: Y.Doc,
  title = "新建分组",
  parentId: string | null = null,
): NoteMeta {
  const id = newId("grp");
  const folder: NoteMeta = {
    id,
    title,
    fragment: "",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    order: siblingsOf(doc, parentId).length,
    parentId,
    isFolder: true,
  };
  upsertNote(doc, folder);
  return folder;
}

// ---------------------------------------------------------------------------
// 目录树
// ---------------------------------------------------------------------------

export interface NoteTreeNode {
  note: NoteMeta;
  children: NoteTreeNode[];
  depth: number;
}

/** 同一层级的兄弟（按 order） */
export function siblingsOf(doc: Y.Doc, parentId: string | null): NoteMeta[] {
  return listNotes(doc).filter((n) => (n.parentId ?? null) === parentId);
}

/**
 * 构目录树。
 *
 * 先按 parentId 从根往下走；`seen` 保证成环时能停下来。
 * 走不到的节点（parentId 指向不存在的分组、或处于环里）**兜底挂到顶层**——
 * 宁可层级不对，也不能让笔记从界面上消失。
 */
export function buildNoteTree(doc: Y.Doc): NoteTreeNode[] {
  const all = listNotes(doc);
  const seen = new Set<string>();

  const childrenOf = (parentId: string | null): NoteMeta[] =>
    all.filter((n) => (n.parentId ?? null) === parentId && !seen.has(n.id));

  const build = (parentId: string | null, depth: number): NoteTreeNode[] =>
    childrenOf(parentId).map((note) => {
      seen.add(note.id);
      return { note, children: build(note.id, depth + 1), depth };
    });

  const roots = build(null, 0);

  for (const orphan of all) {
    if (seen.has(orphan.id)) continue;
    seen.add(orphan.id);
    roots.push({ note: orphan, children: build(orphan.id, 1), depth: 0 });
  }

  return roots;
}

/** 从根到该笔记的分组路径（面包屑用） */
export function notePath(doc: Y.Doc, id: NoteId): NoteMeta[] {
  const path: NoteMeta[] = [];
  const seen = new Set<string>();
  let cursor = readNote(doc, id);
  while (cursor?.parentId) {
    if (seen.has(cursor.parentId)) break;
    seen.add(cursor.parentId);
    const parent = readNote(doc, cursor.parentId);
    if (!parent) break;
    path.unshift(parent);
    cursor = parent;
  }
  return path;
}

/** 移动（换父分组） */
export function moveNote(doc: Y.Doc, id: NoteId, parentId: string | null): void {
  const note = readNote(doc, id);
  if (!note || note.id === parentId) return;
  // 不能移进自己的子树（会成环）
  let cursor = parentId;
  while (cursor) {
    if (cursor === id) return;
    cursor = readNote(doc, cursor)?.parentId ?? null;
  }
  getNotes(doc).set(id, { ...note, parentId, updatedAt: Date.now() });
}

/** 按给定顺序重排同层（order = 下标） */
export function reorderNotes(doc: Y.Doc, orderedIds: NoteId[]): void {
  const notes = getNotes(doc);
  orderedIds.forEach((id, index) => {
    const note = notes.get(id);
    if (note && note.order !== index) notes.set(id, { ...note, order: index });
  });
}

/**
 * 移动到指定父级下的指定位置（拖拽落点用）。
 *
 * @param index 在该父级子节点中的插入下标（0 = 最前）
 */
export function moveNoteTo(
  doc: Y.Doc,
  id: NoteId,
  parentId: string | null,
  index: number,
): void {
  if (!readNote(doc, id)) return;
  moveNote(doc, id, parentId);
  const after = readNote(doc, id);
  // moveNote 可能因「移进自己子树」而拒绝，落点就没变，直接放弃
  if (!after || (after.parentId ?? null) !== parentId) return;

  const siblings = listNotes(doc)
    .filter((n) => (n.parentId ?? null) === parentId && n.id !== id)
    .map((n) => n.id);
  const at = Math.max(0, Math.min(index, siblings.length));
  siblings.splice(at, 0, id);
  doc.transact(() => reorderNotes(doc, siblings));
}

/** 设标签 */
export function setNoteTags(doc: Y.Doc, id: NoteId, tags: string[]): void {
  const note = readNote(doc, id);
  if (!note) return;
  getNotes(doc).set(id, { ...note, tags, updatedAt: Date.now() });
}

/**
 * 对账 `node.blockIds`：把指向「已不存在的文档块」的引用清掉。
 *
 * 为什么要这一步：`blockIds` 是节点指向文档块的**反向引用**，但它只写不读，
 * 于是删笔记 / 删卡片后没人清理 → 节点上永远挂着指向幽灵块的 id。
 * 真相以文档 fragment 为准（卡片的 `nodeId` 才是权威方向），这里把它拉回来。
 *
 * @returns 被清理的节点数
 */
export function reconcileBlockIds(doc: Y.Doc, fragmentNames: string[]): number {
  const alive = new Set<string>();
  for (const name of fragmentNames) {
    if (!name) continue;
    const xml = doc.getXmlFragment(name).toString();
    for (const match of xml.matchAll(/<blockcontainer id="([^"]+)"/g)) {
      if (match[1]) alive.add(match[1]);
    }
  }

  const nodes = doc.getMap<import("./schema").KnowledgeNode>("nodes");
  let changed = 0;
  for (const [id, node] of nodes) {
    const current = node.blockIds ?? [];
    const kept = current.filter((blockId) => alive.has(blockId));
    if (kept.length === current.length) continue;
    nodes.set(id, { ...node, blockIds: kept });
    changed += 1;
  }
  return changed;
}

/** 递归删掉一篇笔记/分组及其子孙 */
export function removeNoteDeep(doc: Y.Doc, id: NoteId): number {
  const tree = buildNoteTree(doc);
  const collect = (nodes: NoteTreeNode[]): string[] =>
    nodes.flatMap((n) => (n.note.id === id ? flattenIds(n) : collect(n.children)));
  const flattenIds = (node: NoteTreeNode): string[] => [
    node.note.id,
    ...node.children.flatMap(flattenIds),
  ];

  const ids = collect(tree);
  for (const target of ids) removeNote(doc, target);
  return ids.length;
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
