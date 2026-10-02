import { describe, expect, test } from "bun:test";
import * as Y from "yjs";
import { createNote, readNote, setNoteTags } from "./notes";
import { upsertNode } from "./schema";
import { deleteTag, renameTag } from "./tags";
import type { KnowledgeNode } from "./schema";

function freshDoc(): Y.Doc {
  return new Y.Doc();
}

function node(id: string, tags: string[]): KnowledgeNode {
  return { id, kind: "concept", title: id, relations: [], tags };
}

describe("标签重命名 / 合并 / 删除", () => {
  test("重命名同时改笔记与节点上的标签", () => {
    const doc = freshDoc();
    const note = createNote(doc, "N");
    setNoteTags(doc, note.id, ["旧", "别的"]);
    upsertNode(doc, node("n1", ["旧"]));

    const changed = renameTag(doc, "旧", "新");
    expect(changed).toBe(2);
    expect(readNote(doc, note.id)?.tags).toEqual(["新", "别的"]);
    expect(doc.getMap<KnowledgeNode>("nodes").get("n1")?.tags).toEqual(["新"]);
  });

  test("目标标签已存在 → 合并并去重", () => {
    const doc = freshDoc();
    const note = createNote(doc, "N");
    setNoteTags(doc, note.id, ["旧", "新"]);

    renameTag(doc, "旧", "新");
    expect(readNote(doc, note.id)?.tags).toEqual(["新"]);
  });

  test("删除标签从所有条目摘掉", () => {
    const doc = freshDoc();
    const note = createNote(doc, "N");
    setNoteTags(doc, note.id, ["x", "y"]);
    upsertNode(doc, node("n1", ["x"]));

    expect(deleteTag(doc, "x")).toBe(2);
    expect(readNote(doc, note.id)?.tags).toEqual(["y"]);
    expect(doc.getMap<KnowledgeNode>("nodes").get("n1")?.tags).toEqual([]);
  });

  test("空标签 / 同名不做任何事", () => {
    const doc = freshDoc();
    const note = createNote(doc, "N");
    setNoteTags(doc, note.id, ["a"]);
    expect(renameTag(doc, "a", "a")).toBe(0);
    expect(renameTag(doc, "", "b")).toBe(0);
    expect(deleteTag(doc, "")).toBe(0);
  });
});
