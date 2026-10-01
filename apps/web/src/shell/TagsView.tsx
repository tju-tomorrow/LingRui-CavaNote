/**
 * 标签（PRD/主界面.md §5.5）
 *
 * 横切标签：**笔记和知识节点都能打**，这里做统一索引页。
 * 点标签 → 列出所有带它的笔记与节点；点条目 → 跳过去。
 */
import { useMemo, useState } from "react";
import type { KnowledgeNode, NoteMeta } from "@lingrui/knowledge";
import { useKnowledgeNodes, useKnowledgeNotes } from "../collab/useKnowledge";
import { setFocus } from "../state/focus";
import { setActiveNote } from "../state/notes";
import { setView } from "../state/view";

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

  const tags = useMemo(() => collect(notes, nodes), [notes, nodes]);
  const current = tags.find((t) => t.tag === active) ?? null;

  return (
    <div className="view-page">
      <header className="view-head">
        <h2>标签</h2>
        <p className="view-sub">
          横切笔记与知识节点。给笔记打标签：笔记树里双击重命名旁边没有入口 —— 目前可在
          详情卡编辑节点标签；笔记标签随导出一起写进文档。
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
              onClick={() => setActive(active === t.tag ? null : t.tag)}
            >
              #{t.tag} <span className="view-chip-count">{t.notes.length + t.nodes.length}</span>
            </button>
          ))}
        </div>
      )}

      {current ? (
        <div className="tag-detail">
          <h3>#{current.tag}</h3>

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
