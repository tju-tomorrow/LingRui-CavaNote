/**
 * 命令面板（⌘K）（PRD/主界面.md §2.1、§5.6、ADR-0007）
 *
 * 用 **Orama** 做客户端全文检索，索引知识节点的
 * title / summary / kind / roles / faq / tags / tech。
 *
 * ⚠️ Orama 默认分词器把非 ASCII（汉字）当分隔符**直接丢弃**，中文完全搜不到。
 * 所以传一个 **CJK tokenizer**：拉丁词照常切，CJK 连续片段切成「单字 + 双字(bigram)」，
 * 从而支持「雪崩」这类中文子串检索。文档与查询共用同一个 tokenizer。
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { create, insertMultiple, search } from "@orama/orama";
import type { KnowledgeNode } from "@lingrui/knowledge";
import { useKnowledgeNodes } from "../collab/useKnowledge";
import { setFocus } from "../state/focus";

interface Hit {
  id: string;
  kind: string;
  title: string;
  summary: string;
}

/** CJK 友好的 tokenizer：拉丁词 + 汉字单字 + 汉字双字 */
const cjkTokenizer = {
  language: "cjk",
  normalizationCache: new Map<string, string>(),
  tokenize(raw: string): string[] {
    const out: string[] = [];
    for (const w of raw.toLowerCase().match(/[a-z0-9_'-]+/g) ?? []) out.push(w);
    for (const run of raw.match(/[\u4e00-\u9fff]+/g) ?? []) {
      for (let i = 0; i < run.length; i++) out.push(run[i]!);
      for (let i = 0; i + 1 < run.length; i++) out.push(run.slice(i, i + 2));
    }
    return out;
  },
};

function searchableText(n: KnowledgeNode): string {
  const tech = Array.isArray(n.meta?.["tech"]) ? (n.meta?.["tech"] as string[]) : [];
  return [
    n.title,
    n.summary ?? "",
    n.kind,
    ...(n.roles ?? []),
    ...(n.faq ?? []).map((f) => f.q),
    ...(n.tags ?? []),
    ...tech,
  ].join(" ");
}

function makeIndex(nodes: KnowledgeNode[]) {
  const db = create({
    schema: { id: "string", kind: "string", title: "string", summary: "string", text: "string" },
    components: { tokenizer: cjkTokenizer },
  });
  insertMultiple(
    db,
    nodes.map((n) => ({
      id: n.id,
      kind: n.kind,
      title: n.title,
      summary: n.summary ?? "",
      text: searchableText(n),
    })),
  );
  return db;
}

export function CommandPalette({ onClose }: { onClose: () => void }) {
  const nodes = useKnowledgeNodes();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Hit[]>([]);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const db = useMemo(() => makeIndex(nodes), [nodes]);

  useEffect(() => {
    const kw = q.trim();
    let cancelled = false;

    if (!kw) {
      setResults(
        nodes
          .slice(0, 8)
          .map((n) => ({ id: n.id, kind: n.kind, title: n.title, summary: n.summary ?? "" })),
      );
      return;
    }

    void (async () => {
      const res = await search(db, { term: kw, limit: 10, properties: ["text", "title"] });
      if (!cancelled) setResults(res.hits.map((h) => h.document as unknown as Hit));
    })();

    return () => {
      cancelled = true;
    };
  }, [db, q, nodes]);

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
                <span className="palette-sub">{r.summary}</span>
              </button>
            </li>
          ))}
          {results.length === 0 ? <li className="palette-empty">没有匹配的知识节点</li> : null}
        </ul>
      </div>
    </div>
  );
}
