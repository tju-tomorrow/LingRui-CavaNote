/**
 * 标签（PRD/主界面.md §5.5）
 *
 * 横切标签：**笔记和知识节点都能打**，这里做统一索引页。
 * 点标签 → 列出所有带它的笔记与节点；点条目 → 跳过去。
 *
 * 标签可**重命名 / 合并 / 删除**：改名时会同时改笔记与节点两处
 * （见 @lingrui/knowledge 的 renameTag），输入一个已存在的名字即合并。
 */
import { useMemo, useState } from "react";
import { deleteTag, renameTag, type KnowledgeNode, type NoteMeta } from "@lingrui/knowledge";
import { ydoc } from "../collab/doc";
import { useKnowledgeNodes, useKnowledgeNotes } from "../collab/useKnowledge";
import { setFocus } from "../state/focus";
import { setActiveNote } from "../state/notes";
import { setView } from "../state/view";
import { toast } from "./actions";

interface Tagged {
  tag: string;
  notes: NoteMeta[];
  nodes: KnowledgeNode[];
}

function collect(notes: NoteMeta[], nodes: KnowledgeNode[]): Tagged[] {
  const map = new Map<string, Tagged>();
  const touch = (tag: string): Tagged => {
    const found = map.get(tag) ?? { tag, notes: [], nodes: [] };
    map.set(tag, found);
    return found;
  };

  for (const note of notes) {
    for (const tag of note.tags ?? []) touch(tag).notes.push(note);
  }
  for (const node of nodes) {
    for (const tag of node.tags ?? []) touch(tag).nodes.push(node);
  }

  return [...map.values()].sort(
    (a, b) => b.notes.length + b.nodes.length - (a.notes.length + a.nodes.length) || a.tag.localeCompare(b.tag),
  );
}

export function TagsView() {
  const notes = useKnowledgeNotes();
  const nodes = useKnowledgeNodes();
  const [active, setActive] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const tags = useMemo(() => collect(notes, nodes), [notes, nodes]);
  const current = tags.find((t) => t.tag === active) ?? null;

  const commitRename = () => {
    if (!current) return;
    const value = draft.trim().replace(/^#/, "");
    setEditing(false);
    if (!value || value === current.tag) return;
    const merged = tags.some((t) => t.tag === value);
    const changed = renameTag(ydoc, current.tag, value);
    setActive(value);
    toast(
      merged
        ? `已把 #${current.tag} 合并到 #${value}（${changed} 处）`
        : `已重命名为 #${value}（${changed} 处）`,
    );
  };

  const removeTag = () => {
    if (!current) return;
    if (!window.confirm(`删除标签 #${current.tag}？会从所有笔记与节点上摘掉。`)) return;
    const changed = deleteTag(ydoc, current.tag);
    setActive(null);
    toast(`已删除 #${current.tag}（${changed} 处）`);
  };

  return (
    <div className="view-page">
      <header className="view-head">
        <h2>标签</h2>
        <p className="view-sub">
          横切笔记与知识节点。选中一个标签可重命名 / 合并（输入已存在的标签名即合并）或删除。
        </p>
      </header>

      {tags.length === 0 ? (
        <p className="view-empty">还没有标签。给节点打标签：详情卡 ✎ → 添加标签。</p>
      ) : (
        <div className="view-chips">
          {tags.map((t) => (
            <button
              key={t.tag}
              type="button"
              className={`view-chip${active === t.tag ? " active" : ""}`}
              onClick={() => {
                setActive(active === t.tag ? null : t.tag);
                setEditing(false);
              }}
            >
              #{t.tag} <span className="view-chip-count">{t.notes.length + t.nodes.length}</span>
            </button>
          ))}
        </div>
      )}

      {current ? (
        <div className="tag-detail">
          <div className="tag-detail-head">
            {editing ? (
              <input
                className="tag-rename"
                autoFocus
                value={draft}
                list="lr-tag-options"
                aria-label="重命名标签"
                onFocus={(e) => e.currentTarget.select()}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                  if (e.key === "Escape") {
                    setEditing(false);
                    setDraft(current.tag);
                  }
                }}
              />
            ) : (
              <h3>#{current.tag}</h3>
            )}
            <div className="tag-actions">
              <button
                type="button"
                className="view-chip"
                onClick={() => {
                  setDraft(current.tag);
                  setEditing(true);
                }}
              >
                重命名 / 合并
              </button>
              <button type="button" className="view-chip danger" onClick={removeTag}>
                删除
              </button>
            </div>
          </div>

          <datalist id="lr-tag-options">
            {tags
              .filter((t) => t.tag !== current.tag)
              .map((t) => (
                <option key={t.tag} value={t.tag} />
              ))}
          </datalist>

          {current.notes.length > 0 ? (
            <>
              <div className="view-group-label">笔记</div>
              <ul className="view-list">
                {current.notes.map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      className="view-row"
                      onClick={() => {
                        setActiveNote(n.id);
                        setView("notes");
                      }}
                    >
                      <span className="view-row-main">
                        <span className="view-row-title">{n.title}</span>
                      </span>
                      <span className="view-row-meta">笔记</span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          {current.nodes.length > 0 ? (
            <>
              <div className="view-group-label">知识节点</div>
              <ul className="view-list">
                {current.nodes.map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      className="view-row"
                      onClick={() => {
                        setFocus(n.id);
                        setView("notes");
                      }}
                    >
                      <span className="view-row-main">
                        <span className="view-row-title">{n.title}</span>
                        <span className="view-row-sub">{n.summary ?? ""}</span>
                      </span>
                      <span className="view-row-meta">{n.kind}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
