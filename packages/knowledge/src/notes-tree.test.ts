/**
 * 笔记树：移动 / 排序 / 删除 —— 拖拽交互依赖这些纯函数。
 */
import { describe, expect, test } from "bun:test";
import * as Y from "yjs";
import {
  buildNoteTree,
  createFolder,
  createNote,
  listNotes,
  moveNoteTo,
  notePath,
  removeNoteDeep,
  siblingsOf,
} from "./notes";

function fresh(): Y.Doc {
  return new Y.Doc();
}

const orderAt = (doc: Y.Doc, parentId: string | null) =>
  siblingsOf(doc, parentId).map((n) => n.title);

describe("目录树", () => {
  test("顶层顺序按创建顺序", () => {
    const doc = fresh();
    createNote(doc, "A");
    createNote(doc, "B");
    createNote(doc, "C");
    expect(orderAt(doc, null)).toEqual(["A", "B", "C"]);
  });

  test("分组下能挂子节点", () => {
    const doc = fresh();
    const folder = createFolder(doc, "组");
    createNote(doc, "子1", folder.id);
    createNote(doc, "子2", folder.id);
    expect(orderAt(doc, folder.id)).toEqual(["子1", "子2"]);
    const tree = buildNoteTree(doc);
    expect(tree).toHaveLength(1);
    expect(tree[0]!.children.map((c) => c.note.title)).toEqual(["子1", "子2"]);
  });
});

describe("moveNoteTo（拖拽落点）", () => {
  test("拖进分组：挂到目标下并追加到末尾", () => {
    const doc = fresh();
    const a = createNote(doc, "A");
    createNote(doc, "B");
    const folder = createFolder(doc, "组");
    createNote(doc, "已有", folder.id);

    moveNoteTo(doc, a.id, folder.id, 1);
    expect(orderAt(doc, null)).toEqual(["B", "组"]);
    expect(orderAt(doc, folder.id)).toEqual(["已有", "A"]);
  });

  test("同层重排：插到指定下标", () => {
    const doc = fresh();
    const a = createNote(doc, "A");
    createNote(doc, "B");
    createNote(doc, "C");
    // 把 A 移到 B 后面 → B A C
    moveNoteTo(doc, a.id, null, 1);
    expect(orderAt(doc, null)).toEqual(["B", "A", "C"]);
  });

  test("不能移进自己的子树（拒绝，结构不变）", () => {
    const doc = fresh();
    const parent = createFolder(doc, "父");
    const child = createFolder(doc, "子", parent.id);
    createNote(doc, "孙", child.id);

    moveNoteTo(doc, parent.id, child.id, 0);
    expect(orderAt(doc, null)).toEqual(["父"]);
    expect(notePath(doc, parent.id)).toEqual([]);
  });

  test("跨层移动后仍能构出正确的树", () => {
    const doc = fresh();
    const a = createNote(doc, "A");
    const folder = createFolder(doc, "组");
    moveNoteTo(doc, a.id, folder.id, 0);
    const tree = buildNoteTree(doc);
    const group = tree.find((n) => n.note.id === folder.id);
    expect(group?.children.map((c) => c.note.title)).toEqual(["A"]);
    expect(notePath(doc, a.id).map((n) => n.title)).toEqual(["组"]);
  });
});

describe("removeNoteDeep", () => {
  test("删分组会连带删掉全部子孙", () => {
    const doc = fresh();
    const folder = createFolder(doc, "组");
    createNote(doc, "子1", folder.id);
    const sub = createFolder(doc, "子组", folder.id);
    createNote(doc, "孙", sub.id);
    createNote(doc, "旁观者");

    const removed = removeNoteDeep(doc, folder.id);
    expect(removed).toBe(4);
    expect(listNotes(doc).map((n) => n.title)).toEqual(["旁观者"]);
  });
});
