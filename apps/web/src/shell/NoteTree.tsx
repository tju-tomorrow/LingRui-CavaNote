/**
 * 笔记树（PRD/主界面.md §2.3、§5.5）
 *
 * 两段：
 *   1. **目录树**——真实的多级分组 + 笔记（Y.Doc 的 notes root，靠 parentId 组树），
 *      可新建笔记 / 新建分组 / 重命名 / 删除，分组可折叠
 *   2. **知识节点**——从 Y.Doc 派生，点击 = 聚焦（画布高亮 + 文档滚动 + 详情卡弹出）
 *
 * 「知识是全局的、笔记是多份的」：所以节点列表不随笔记切换而变，
 * 这正是「知识库跨笔记」的体现。
 */
import { useEffect, useMemo, useState } from "react";
import {
  buildNoteTree,
  createFolder,
  createNote,
  removeNoteDeep,
  renameNote,
  type NoteMeta,
  type NoteTreeNode,
} from "@lingrui/knowledge";
import { ydoc } from "../collab/doc";
import { useKnowledgeNodes, useKnowledgeNotes } from "../collab/useKnowledge";
import { setFocus, useFocus } from "../state/focus";
import { setActiveNote, useActiveNote } from "../state/notes";

/** 折叠状态存 localStorage：刷新后保持展开的样子 */
const COLLAPSED_KEY = "lingrui-tree-collapsed";

function loadCollapsed(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

function useCollapsed() {
  const [collapsed, setCollapsed] = useState<Set<string>>(loadCollapsed);
  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...next]));
      } catch {
        /* ignore */
      }
      return next;
    });
  return { collapsed, toggle };
}

export function NoteTree() {
  const nodes = useKnowledgeNodes();
  const notes = useKnowledgeNotes();
  const active = useActiveNote();
  const focus = useFocus();
  const { collapsed, toggle } = useCollapsed();
  const [editingId, setEditingId] = useState<string | null>(null);

  // notes 变了才重建树（useKnowledgeNotes 已订阅 root）
  const tree = useMemo(() => buildNoteTree(ydoc), [notes]);

  /** 当前笔记所在的父分组（新建时放进同一层，符合直觉） */
  const parentOfActive = useMemo(() => {
    const find = (list: NoteTreeNode[]): NoteMeta | undefined => {
      for (const node of list) {
        if (node.note.id === active) return node.note;
        const hit = find(node.children);
        if (hit) return hit;
      }
      return undefined;
    };
    return find(tree)?.parentId ?? null;
  }, [tree, active]);

  const addNote = (parentId: string | null) => {
    const note = createNote(ydoc, "未命名笔记", parentId);
    setActiveNote(note.id);
    setEditingId(note.id);
  };

  const addFolder = (parentId: string | null) => {
    const folder = createFolder(ydoc, "新建分组", parentId);
    setEditingId(folder.id);
  };

  const drop = (note: NoteMeta) => {
    const label = note.isFolder ? `分组「${note.title}」及其全部内容` : `笔记「${note.title}」`;
    if (!window.confirm(`删除${label}？`)) return;
    removeNoteDeep(ydoc, note.id);
    if (active === note.id || !notes.some((n) => n.id === active)) {
      const next = notes.find((n) => n.id !== note.id && !n.isFolder);
      if (next) setActiveNote(next.id);
    }
  };

  const renderRow = (node: NoteTreeNode) => {
    const { note, children, depth } = node;
    const indent = 14 + depth * 14;
    const isFolder = Boolean(note.isFolder);
    const isCollapsed = collapsed.has(note.id);

    if (editingId === note.id) {
      return (
        <input
          key={note.id}
          className="tree-rename"
          style={{ marginLeft: indent }}
          defaultValue={note.title}
          autoFocus
          aria-label="名称"
          onBlur={(e) => {
            renameNote(ydoc, note.id, e.target.value.trim() || note.title);
            setEditingId(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") setEditingId(null);
          }}
        />
      );
    }

    return (
      <div key={note.id}>
        <div
          className={`tree-item${active === note.id ? " active" : ""}${isFolder ? " tree-folder" : ""}`}
          style={{ paddingLeft: indent }}
        >
          {isFolder ? (
            <button
              className="tree-twisty"
              type="button"
              aria-label={isCollapsed ? "展开" : "折叠"}
              onClick={() => toggle(note.id)}
            >
              {isCollapsed ? "▸" : "▾"}
            </button>
          ) : (
            <span className="tree-twisty tree-twisty-leaf" />
          )}

          <button
            type="button"
            className="tree-note-btn"
            onClick={() => (isFolder ? toggle(note.id) : setActiveNote(note.id))}
            onDoubleClick={() => setEditingId(note.id)}
            title={isFolder ? "单击折叠 · 双击重命名" : "单击打开 · 双击重命名"}
          >
            {isFolder ? "📁 " : ""}
            {note.title}
            {note.tags?.length ? <span className="tree-tags">{note.tags.map((t) => `#${t}`).join(" ")}</span> : null}
          </button>

          <span className="tree-note-actions">
            {isFolder ? (
              <>
                <button type="button" title="在此分组下新建笔记" onClick={() => addNote(note.id)}>
                  ＋
                </button>
                <button type="button" title="在此分组下新建子分组" onClick={() => addFolder(note.id)}>
                  ▤
                </button>
              </>
            ) : null}
            <button type="button" title="重命名" onClick={() => setEditingId(note.id)}>
              ✎
            </button>
            <button type="button" title="删除" onClick={() => drop(note)}>
              ✕
            </button>
          </span>
        </div>

        {isFolder && !isCollapsed ? children.map(renderRow) : null}
        {!isFolder ? children.map(renderRow) : null}
      </div>
    );
  };

  return (
    <nav className="tree">
      <div className="tree-head">
        <span>笔记</span>
        <span className="tree-actions">
          <button type="button" title="新建笔记" onClick={() => addNote(parentOfActive)}>
            ＋
          </button>
          <button type="button" title="新建分组" onClick={() => addFolder(parentOfActive)}>
            ▤
          </button>
        </span>
      </div>

      {tree.length === 0 ? <div className="tree-empty">还没有笔记</div> : tree.map(renderRow)}

      <div className="tree-group">知识节点（{nodes.length}）</div>
      {nodes.map((n) => (
        <button
          key={n.id}
          type="button"
          className={`tree-node${focus === n.id ? " active" : ""}`}
          style={{ paddingLeft: 18 }}
          onClick={() => setFocus(n.id)}
          title={n.summary ?? n.title}
        >
          <span className={`tree-dot kind-${n.kind}`} />
          <span>{n.title}</span>
        </button>
      ))}
    </nav>
  );
}
