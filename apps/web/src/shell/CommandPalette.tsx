/**
 * 命令面板（⌘K）（PRD/主界面.md §2.1、§5.6）
 *
 * P1.5 版：搜「知识节点」（来自 Y.Doc），回车/点击 = 聚焦节点。
 * Orama 全文检索为 P4。
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useKnowledgeNodes } from "../collab/useKnowledge";
import { setFocus } from "../state/focus";

export function CommandPalette({ onClose }: { onClose: () => void }) {
  const nodes = useKnowledgeNodes();
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const results = useMemo(() => {
    const rows = nodes.map((n) => {
      const tech = Array.isArray(n.meta?.["tech"]) ? (n.meta?.["tech"] as string[]) : [];
      const hay = [
        n.title,
        n.summary ?? "",
        n.kind,
        ...(n.roles ?? []),
        ...(n.faq ?? []).map((f) => f.q),
        ...(n.tags ?? []),
        ...tech,
      ]
        .join(" ")
        .toLowerCase();
      return { id: n.id, kind: n.kind, title: n.title, sub: n.summary ?? "", hay };
    });
    const kw = q.trim().toLowerCase();
    if (!kw) return rows.slice(0, 8);
    return rows.filter((r) => r.hay.includes(kw)).slice(0, 10);
  }, [nodes, q]);

  const pick = (id: string) => {
    setFocus(id);
    onClose();
  };

  return (
    <div className="palette-mask" onClick={onClose}>
      <div className="palette" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="palette-input"
          placeholder="搜索笔记、知识、标签…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && results[0]) pick(results[0].id);
          }}
        />
        <ul className="palette-list">
          {results.map((r) => (
            <li key={r.id}>
              <button type="button" className="palette-item" onClick={() => pick(r.id)}>
                <span className="palette-kind">{r.kind}</span>
                <span className="palette-title">{r.title}</span>
                <span className="palette-sub">{r.sub}</span>
              </button>
            </li>
          ))}
          {results.length === 0 ? <li className="palette-empty">没有匹配的知识节点</li> : null}
        </ul>
      </div>
    </div>
  );
}
