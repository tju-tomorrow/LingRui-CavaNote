/**
 * 笔记树（PRD/主界面.md §2.3、§5.5）
 *
 * 两段：
 *   1. **笔记**——真实的笔记列表（Y.Doc 的 notes root），可新建 / 重命名 / 删除
 *   2. **知识节点**——从 Y.Doc 派生，点击 = 聚焦（画布高亮 + 文档滚动 + 详情卡弹出）
 *
 * 「知识是全局的、笔记是多份的」：所以节点列表不随笔记切换而变，
 * 这正是「知识库跨笔记」的体现。
 */
import { useEffect, useState } from "react";
import { createNote, listNotes, removeNote, renameNote, type NoteMeta } from "@lingrui/knowledge";
import { ydoc } from "../collab/doc";
import { useKnowledgeNodes } from "../collab/useKnowledge";
import { setFocus, useFocus } from "../state/focus";
import { setActiveNote, useActiveNote } from "../state/notes";

function useNotes(): NoteMeta[] {
  const [notes, setNotes] = useState<NoteMeta[]>(() => listNotes(ydoc));
  useEffect(() => {
    const update = () => setNotes(listNotes(ydoc));
    update();
    ydoc.getMap("notes").observe(update);
    return () => ydoc.getMap("notes").unobserve(update);
  }, []);
  return notes;
}

export function NoteTree() {
  const nodes = useKnowledgeNodes();
  const notes = useNotes();
  const active = useActiveNote();
  const focus = useFocus();
  const [editingId, setEditingId] = useState<string | null>(null);

  const addNote = () => {
    const note = createNote(ydoc, "未命名笔记");
    setActiveNote(note.id);
    setEditingId(note.id);
  };

  const dropNote = (note: NoteMeta) => {
    if (notes.length <= 1) return; // 至少留一篇
    if (!window.confirm(`删除笔记「${note.title}」？正文会一并清掉。`)) return;
    removeNote(ydoc, note.id);
    if (active === note.id) {
      const next = listNotes(ydoc)[0];
      if (next) setActiveNote(next.id);
    }
  };

  return (
    <nav className="tree">
      <div className="tree-head">
        <span>笔记</span>
        <span className="tree-actions">
          <button type="button" title="新建笔记" onClick={addNote}>
            ＋
          </button>
        </span>
      </div>

      {notes.map((note) =>
        editingId === note.id ? (
          <input
            key={note.id}
            className="tree-rename"
            defaultValue={note.title}
            autoFocus
            aria-label="笔记标题"
            onBlur={(e) => {
              renameNote(ydoc, note.id, e.target.value.trim() || note.title);
              setEditingId(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") setEditingId(null);
            }}
          />
        ) : (
          <div
            key={note.id}
            className={`tree-item${active === note.id ? " active" : ""}`}
            style={{ paddingLeft: 18 }}
          >
            <button
              type="button"
              className="tree-note-btn"
              onClick={() => setActiveNote(note.id)}
              onDoubleClick={() => setEditingId(note.id)}
              title="单击打开 · 双击重命名"
            >
              {note.title}
            </button>
            <span className="tree-note-actions">
              <button type="button" title="重命名" onClick={() => setEditingId(note.id)}>
                ✎
              </button>
              <button
                type="button"
                title="删除"
                disabled={notes.length <= 1}
                onClick={() => dropNote(note)}
              >
                ✕
              </button>
            </span>
          </div>
        ),
      )}

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
