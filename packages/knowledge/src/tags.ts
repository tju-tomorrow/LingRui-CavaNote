/**
 * 标签的批量操作：重命名 / 合并 / 删除（PRD/主界面.md §5.5）
 *
 * 标签同时挂在**笔记**（ROOT_NOTES）和**知识节点**（ROOT_NODES）上，
 * 所以两处必须一起改 —— 否则「给标签改个名」只会改一半，另一半变成孤儿标签。
 *
 * 纯函数、只依赖 doc，便于测试；UI 只负责触发与刷新。
 */
import type * as Y from "yjs";
import { getNotes } from "./notes";
import { getNodes } from "./schema";

function normalize(tag: string): string {
  return tag.trim().replace(/^#/, "");
}

/**
 * 把 `from` 标签改成 `to`。若 `to` 已存在，等价于**合并**（同一条目上不会出现两个）。
 *
 * @returns 被改动的条目数（笔记 + 节点各算一条）
 */
export function renameTag(doc: Y.Doc, from: string, to: string): number {
  const source = normalize(from);
  const target = normalize(to);
  if (!source || !target || source === target) return 0;

  /** 命中 source 就返回改写后的新数组（去重），否则 null 表示不动 */
  const swap = (tags: string[] | undefined): string[] | null => {
    if (!tags || !tags.includes(source)) return null;
    const next: string[] = [];
    for (const tag of tags) {
      const value = tag === source ? target : tag;
      if (!next.includes(value)) next.push(value);
    }
    return next;
  };

  let changed = 0;
  doc.transact(() => {
    const notes = getNotes(doc);
    for (const [id, note] of notes) {
      const next = swap(note.tags);
      if (next) {
        notes.set(id, { ...note, tags: next });
        changed += 1;
      }
    }
    const nodes = getNodes(doc);
    for (const [id, node] of nodes) {
      const next = swap(node.tags);
      if (next) {
        nodes.set(id, { ...node, tags: next });
        changed += 1;
      }
    }
  });
  return changed;
}

/**
 * 从所有笔记与节点上摘掉某个标签。
 *
 * @returns 被改动的条目数
 */
export function deleteTag(doc: Y.Doc, tag: string): number {
  const target = normalize(tag);
  if (!target) return 0;

  const strip = (tags: string[] | undefined): string[] | null => {
    if (!tags || !tags.includes(target)) return null;
    return tags.filter((t) => t !== target);
  };

  let changed = 0;
  doc.transact(() => {
    const notes = getNotes(doc);
    for (const [id, note] of notes) {
      const next = strip(note.tags);
      if (next) {
        notes.set(id, { ...note, tags: next });
        changed += 1;
      }
    }
    const nodes = getNodes(doc);
    for (const [id, node] of nodes) {
      const next = strip(node.tags);
      if (next) {
        nodes.set(id, { ...node, tags: next });
        changed += 1;
      }
    }
  });
  return changed;
}
