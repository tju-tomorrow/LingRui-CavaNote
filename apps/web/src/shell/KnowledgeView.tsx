/**
 * 知识库（PRD/主界面.md §5.5）
 *
 * **跨笔记的全局 KnowledgeNode 索引**：按 kind 过滤、可搜索、可跳转。
 * 之所以能做「跨笔记」，是因为知识本来就存在 Y.Doc 顶层、不属于任何一篇笔记
 * （见 packages/knowledge/src/notes.ts 的设计取舍）。
 *
 * 点一个节点 = 回到笔记视图 + 聚焦（画布高亮 / 文档滚动 / 详情卡）。
 */
import { useMemo, useState } from "react";
import { NODE_STYLE } from "@lingrui/canvas";
import type { KnowledgeNode } from "@lingrui/knowledge";
import { useKnowledgeNodes } from "../collab/useKnowledge";
import { setFocus } from "../state/focus";
import { setView } from "../state/view";

const KIND_LABEL: Record<string, string> = {
  client: "调用方",
  gateway: "网关",
  service: "服务",
  cache: "缓存",
  database: "数据库",
  queue: "消息队列",
  registry: "注册中心",
  monitor: "监控",
  concept: "概念",
  note: "笔记",
};

function matches(node: KnowledgeNode, kw: string): boolean {
  if (!kw) return true;
  const haystack = [
    node.title,
    node.summary ?? "",
    node.kind,
    ...(node.roles ?? []),
    ...(node.faq ?? []).flatMap((f) => [f.q, f.a ?? ""]),
    ...(node.tags ?? []),
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(kw.toLowerCase());
}

export function KnowledgeView() {
  const nodes = useKnowledgeNodes();
  const [kind, setKind] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const n of nodes) map.set(n.kind, (map.get(n.kind) ?? 0) + 1);
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [nodes]);

  const visible = useMemo(
    () => nodes.filter((n) => (!kind || n.kind === kind) && matches(n, q.trim())),
    [nodes, kind, q],
  );

  const open = (id: string) => {
    setFocus(id);
    setView("notes");
  };

  return (
    <div className="view-page">
      <header className="view-head">
        <h2>知识库</h2>
        <p className="view-sub">
          全部笔记共享同一份 Knowledge（{nodes.length} 个节点）——这就是「跨笔记」。
        </p>
      </header>

      <input
        className="view-search"
        placeholder="搜索节点（标题 / 摘要 / 要点 / 问答 / 标签）…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />

      <div className="view-chips">
        <button
          type="button"
          className={`view-chip${kind === null ? " active" : ""}`}
          onClick={() => setKind(null)}
        >
          全部 {nodes.length}
        </button>
        {counts.map(([k, n]) => (
          <button
            key={k}
            type="button"
            className={`view-chip${kind === k ? " active" : ""}`}
            onClick={() => setKind(k)}
          >
            {KIND_LABEL[k] ?? k} {n}
          </button>
        ))}
      </div>

      <ul className="view-list">
        {visible.map((n) => {
          const style = NODE_STYLE[n.kind] ?? NODE_STYLE.concept;
          return (
            <li key={n.id}>
              <button type="button" className="view-row" onClick={() => open(n.id)}>
                <span
                  className="view-dot"
                  style={{ background: style?.background, borderColor: style?.stroke }}
                />
                <span className="view-row-main">
                  <span className="view-row-title">{n.title}</span>
                  <span className="view-row-sub">{n.summary ?? "（还没有摘要）"}</span>
                </span>
                <span className="view-row-meta">
                  {n.roles?.length ? `${n.roles.length} 要点` : ""}
                  {n.faq?.length ? ` · ${n.faq.length} 问答` : ""}
                  {n.tags?.length ? ` · ${n.tags.map((t) => `#${t}`).join(" ")}` : ""}
                </span>
              </button>
            </li>
          );
        })}
        {visible.length === 0 ? <li className="view-empty">没有匹配的节点</li> : null}
      </ul>
    </div>
  );
}
