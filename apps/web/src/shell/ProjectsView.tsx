/**
 * 项目（PRD/主界面.md §5.5）
 *
 * 「项目 = 笔记集合 / 文件夹」——所以这里直接把**顶层分组**当作项目：
 * 每张卡片显示它下面有多少笔记，点开就回到笔记视图并展开它。
 * 数据完全复用 notes 树，不额外造一层概念。
 */
import { useMemo, useState } from "react";
import { buildNoteTree, createFolder, listNotes, type NoteTreeNode } from "@lingrui/knowledge";
import { ydoc } from "../collab/doc";
import { useKnowledgeNotes } from "../collab/useKnowledge";
import { setActiveNote } from "../state/notes";
import { setView } from "../state/view";

function countNotes(nodes: NoteTreeNode[]): number {
  return nodes.reduce((sum, n) => sum + (n.note.isFolder ? countNotes(n.children) : 1), 0);
}

export function ProjectsView() {
  const notes = useKnowledgeNotes();
  const [tick, setTick] = useState(0);

  const projects = useMemo(() => {
    void tick;
    return buildNoteTree(ydoc).filter((n) => n.note.isFolder);
  }, [notes, tick]);

  const loose = useMemo(() => {
    void tick;
    return listNotes(ydoc).filter((n) => !n.isFolder && !n.parentId);
  }, [notes, tick]);

  const open = (node: NoteTreeNode) => {
    const first = firstNote(node);
    if (first) setActiveNote(first.note.id);
    setView("notes");
  };

  return (
    <div className="view-page">
      <header className="view-head">
        <h2>项目</h2>
        <p className="view-sub">顶层分组即项目。每张卡片是它下面的全部笔记。</p>
        <button
          className="view-primary"
          type="button"
          onClick={() => {
            // 只建分组就够：**不能**把它设成当前笔记（分组没有正文）
            createFolder(ydoc, "新项目");
            setTick((t) => t + 1);
            setView("notes");
          }}
        >
          ＋ 新建项目
        </button>
      </header>

      <div className="project-grid">
        {projects.map((p) => (
          <button key={p.note.id} type="button" className="project-card" onClick={() => open(p)}>
            <span className="project-name">📁 {p.note.title}</span>
            <span className="project-count">{countNotes(p.children)} 篇笔记</span>
          </button>
        ))}

        {loose.length > 0 ? (
          <button
            type="button"
            className="project-card"
            onClick={() => {
              setActiveNote(loose[0]!.id);
              setView("notes");
            }}
          >
            <span className="project-name">🗂 未分组</span>
            <span className="project-count">{loose.length} 篇笔记</span>
          </button>
        ) : null}

        {projects.length === 0 && loose.length === 0 ? (
          <p className="view-empty">还没有内容。先新建一个项目。</p>
        ) : null}
      </div>
    </div>
  );
}

/** 找分组下第一篇真笔记（递归，取第一个） */
function firstNote(node: NoteTreeNode): NoteTreeNode | undefined {
  if (!node.note.isFolder) return node;
  for (const child of node.children) {
    const hit = firstNote(child);
    if (hit) return hit;
  }
  return undefined;
}
