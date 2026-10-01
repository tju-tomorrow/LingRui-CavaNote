import { describe, expect, test } from "bun:test";
import * as Y from "yjs";
import {
  buildNoteTree,
  createFolder,
  createNote,
  listNotes,
  moveNote,
  notePath,
  removeNoteDeep,
  setNoteTags,
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

describe("目录树（分组）", () => {
  test("createFolder + 嵌套笔记：树按层级组装", () => {
    const doc = freshDoc();
    const folder = createFolder(doc, "技术原理");
    const child = createNote(doc, "HTTP 协议详解", folder.id);
    const top = createNote(doc, "散落笔记");

    const tree = buildNoteTree(doc);
    // 顶层按 order：分组先建（order 0），散落笔记后建（order 1）
    expect(tree.map((n) => n.note.title)).toEqual(["技术原理", "散落笔记"]);
    const grp = tree.find((n) => n.note.isFolder);
    expect(grp?.children.map((n) => n.note.id)).toEqual([child.id]);
    expect(grp?.children[0]?.depth).toBe(1);
    expect(top.parentId).toBeNull();
  });

  test("父分组不存在时归到顶层，而不是消失", () => {
    const doc = freshDoc();
    upsertNote(doc, {
      id: "orphan",
      title: "孤儿笔记",
      fragment: "doc:orphan",
      createdAt: 1,
      updatedAt: 1,
      parentId: "不存在的分组",
    });
    expect(buildNoteTree(doc).map((n) => n.note.id)).toEqual(["orphan"]);
  });

  test("成环不会无限递归", () => {
    const doc = freshDoc();
    upsertNote(doc, { id: "a", title: "A", fragment: "doc:a", createdAt: 1, updatedAt: 1, parentId: "b" });
    upsertNote(doc, { id: "b", title: "B", fragment: "doc:b", createdAt: 2, updatedAt: 2, parentId: "a" });
    // 两个互为父：都归到顶层，且不炸
    const tree = buildNoteTree(doc);
    expect(tree.length).toBeGreaterThan(0);
  });

  test("moveNote 不能把节点移进自己的子树", () => {
    const doc = freshDoc();
    const parent = createFolder(doc, "父");
    const child = createFolder(doc, "子", parent.id);
    moveNote(doc, parent.id, child.id);
    expect(readNote(doc, parent.id)?.parentId).toBeNull();
  });

  test("notePath 给出面包屑", () => {
    const doc = freshDoc();
    const a = createFolder(doc, "一级");
    const b = createFolder(doc, "二级", a.id);
    const leaf = createNote(doc, "正文", b.id);
    expect(notePath(doc, leaf.id).map((n) => n.title)).toEqual(["一级", "二级"]);
  });

  test("removeNoteDeep 连子孙一起删", () => {
    const doc = freshDoc();
    const folder = createFolder(doc, "分组");
    createNote(doc, "子笔记 1", folder.id);
    createNote(doc, "子笔记 2", folder.id);
    expect(removeNoteDeep(doc, folder.id)).toBe(3);
    expect(listNotes(doc)).toHaveLength(0);
  });

  test("setNoteTags 写入标签", () => {
    const doc = freshDoc();
    const note = createNote(doc, "带标签");
    setNoteTags(doc, note.id, ["架构", "入门"]);
    expect(readNote(doc, note.id)?.tags).toEqual(["架构", "入门"]);
  });
});
