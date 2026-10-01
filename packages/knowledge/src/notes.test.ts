import { describe, expect, test } from "bun:test";
import * as Y from "yjs";
import {
  createNote,
  listNotes,
  noteText,
  readNote,
  removeNote,
  renameNote,
  upsertNote,
} from "./notes";

function freshDoc(): Y.Doc {
  return new Y.Doc();
}

describe("笔记（多文档）", () => {
  test("新建的笔记各自有独立 fragment", () => {
    const doc = freshDoc();
    const a = createNote(doc, "A");
    const b = createNote(doc, "B");
    expect(a.fragment).not.toBe(b.fragment);
    expect(a.fragment).toContain("doc:");
    expect(listNotes(doc).map((n) => n.title)).toEqual(["A", "B"]);
  });

  test("order 决定排序，其次才是创建时间", () => {
    const doc = freshDoc();
    upsertNote(doc, {
      id: "n2",
      title: "第二",
      fragment: "doc:n2",
      createdAt: 2,
      updatedAt: 2,
      order: 1,
    });
    upsertNote(doc, {
      id: "n1",
      title: "第一",
      fragment: "doc:n1",
      createdAt: 1,
      updatedAt: 1,
      order: 0,
    });
    expect(listNotes(doc).map((n) => n.id)).toEqual(["n1", "n2"]);
  });

  test("重命名会刷新 updatedAt，但不改 fragment", () => {
    const doc = freshDoc();
    const note = createNote(doc, "旧名");
    renameNote(doc, note.id, "新名");
    const after = readNote(doc, note.id);
    expect(after?.title).toBe("新名");
    expect(after?.fragment).toBe(note.fragment);
    expect(after?.updatedAt).toBeGreaterThanOrEqual(note.updatedAt);
  });

  test("删除只摘掉元信息", () => {
    const doc = freshDoc();
    const note = createNote(doc, "临时");
    expect(removeNote(doc, note.id)).toBe(true);
    expect(readNote(doc, note.id)).toBeUndefined();
    expect(removeNote(doc, note.id)).toBe(false);
  });

  test("noteText 取到正文纯文本（剥掉 XML 标签）", () => {
    const doc = freshDoc();
    const note = createNote(doc, "搜索用");
    const fragment = doc.getXmlFragment(note.fragment);
    const paragraph = new Y.XmlElement("paragraph");
    paragraph.insert(0, [new Y.XmlText("缓存雪崩会让数据库瞬间被打垮")]);
    fragment.insert(0, [paragraph]);

    const text = noteText(doc, note);
    expect(text).toContain("缓存雪崩");
    expect(text).not.toContain("<paragraph>");
  });

  test("fragment 不存在时 noteText 返回空串而不是抛错", () => {
    const doc = freshDoc();
    const note = createNote(doc, "空");
    expect(noteText(doc, { ...note, fragment: "不存在" })).toBe("");
  });
});
