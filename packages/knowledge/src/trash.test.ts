import { describe, expect, test } from "bun:test";
import * as Y from "yjs";
import {
  createFolder,
  createNote,
  emptyTrash,
  listAllNotes,
  listNotes,
  listTrashedNotes,
  purgeNoteDeep,
  readNote,
  restoreNoteDeep,
  trashNoteDeep,
} from "./notes";

function freshDoc(): Y.Doc {
  return new Y.Doc();
}

describe("回收站（软删除 + 恢复）", () => {
  test("删除只是打时间戳：listNotes 隐藏，listAllNotes 还在", () => {
    const doc = freshDoc();
    const a = createNote(doc, "A");
    trashNoteDeep(doc, a.id);

    expect(listNotes(doc).map((n) => n.id)).toEqual([]);
    expect(listAllNotes(doc).map((n) => n.id)).toEqual([a.id]);
    expect(listTrashedNotes(doc).map((n) => n.id)).toEqual([a.id]);
    expect(readNote(doc, a.id)?.trashedAt).toBeGreaterThan(0);
  });

  test("删分组会连子孙一起进回收站，恢复也整棵回来", () => {
    const doc = freshDoc();
    const folder = createFolder(doc, "组");
    const child = createNote(doc, "子", folder.id);

    const n = trashNoteDeep(doc, folder.id);
    expect(n).toBe(2);
    expect(listNotes(doc)).toHaveLength(0);
    expect(listTrashedNotes(doc)).toHaveLength(2);

    restoreNoteDeep(doc, folder.id);
    expect(listNotes(doc).map((x) => x.id).sort()).toEqual([folder.id, child.id].sort());
    expect(listTrashedNotes(doc)).toHaveLength(0);
    expect(readNote(doc, child.id)?.parentId).toBe(folder.id);
  });

  test("父级还在回收站时单独恢复子级 → 挂回顶层，不会看不见", () => {
    const doc = freshDoc();
    const folder = createFolder(doc, "组");
    const child = createNote(doc, "子", folder.id);
    trashNoteDeep(doc, folder.id);

    restoreNoteDeep(doc, child.id);
    expect(readNote(doc, child.id)?.parentId).toBeNull();
    expect(readNote(doc, child.id)?.trashedAt).toBeUndefined();
    // 父级仍留在回收站
    expect(listTrashedNotes(doc).map((n) => n.id)).toEqual([folder.id]);
  });

  test("彻底删除不可恢复；清空回收站只删回收站里的", () => {
    const doc = freshDoc();
    const keep = createNote(doc, "留着");
    const gone = createNote(doc, "删掉");
    trashNoteDeep(doc, gone.id);

    expect(purgeNoteDeep(doc, gone.id)).toBe(1);
    expect(listAllNotes(doc).map((n) => n.id)).toEqual([keep.id]);

    const a = createNote(doc, "a");
    const b = createNote(doc, "b");
    trashNoteDeep(doc, a.id);
    trashNoteDeep(doc, b.id);
    expect(emptyTrash(doc)).toBe(2);
    expect(listAllNotes(doc).map((n) => n.id)).toEqual([keep.id]);
  });
});
