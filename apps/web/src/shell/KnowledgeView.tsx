/**
 * 知识库 —— 知识资产浏览器（ADR-0014：两类资产）
 *
 * **节点资产**（KnowledgeNode）：名词 + 解释 + 形态 + 关系网。
 * **画布资产**（CanvasMeta）：一组已编排的节点引用 + 布局 + 归属笔记。
 *
 * 两类资产都能拖拽复用：
 *   - 节点 → 画布 = 引用（落点即位置）
 *   - 画布 → 画布 = 合并（nodeIds + layout 并进当前画布 / 全局图）
 *
 * 数据格式（拖拽 MIME）：`application/x-lingrui-node` / `application/x-lingrui-canvas`，
 * 画布端（MxStage）按此识别。
 */
import { useMemo, useState } from "react";
import { NODE_STYLE } from "@lingrui/canvas";
import { createCanvas, readNode, upsertNode, type CanvasMeta, type KnowledgeNode } from "@lingrui/knowledge";
import {
  useCanvases,
  useKnowledgeNodes,
  useKnowledgeNotes,
} from "../collab/useKnowledge";
import { setFocus } from "../state/focus";
import { setView } from "../state/view";
import { setActiveCanvas } from "../state/canvas";
import { useActiveNote } from "../state/notes";
import { setCanvasOpen } from "../state/layout";
import { ydoc } from "../collab/doc";
import { documentedNodeIds } from "../editor/bridge";

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

const MIME_NODE = "application/x-lingrui-node";
const MIME_CANVAS = "application/x-lingrui-canvas";

type AssetTab = "nodes" | "canvases";

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

function timeLabel(ts: number): string {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function KnowledgeView() {
  const activeNodes = useKnowledgeNodes();
  const allNodes = useKnowledgeNodes({ includeTrashed: true });
  const canvases = useCanvases();
  const notes = useKnowledgeNotes();
  const activeNoteId = useActiveNote();
  const [tab, setTab] = useState<AssetTab>("nodes");
  const [kind, setKind] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [trashOpen, setTrashOpen] = useState(false);

  const trashedCount = useMemo(
    () => allNodes.filter((n) => n.trashedAt).length,
    [allNodes],
  );
  // 回收站视图下展示的资产 = 已回收集合；回收站清空时退回常规列表
  const nodes = trashOpen && trashedCount > 0 ? allNodes.filter((n) => n.trashedAt) : activeNodes;

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const n of nodes) map.set(n.kind, (map.get(n.kind) ?? 0) + 1);
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [nodes]);

  const visible = useMemo(
    () => nodes.filter((n) => (!kind || n.kind === kind) && matches(n, q.trim())),
    [nodes, kind, q],
  );

  // 哪些节点还没写进文档：正文从未落盘时给个提示（PRD/主界面.md §5.3）
  const documented = useMemo(() => new Set(documentedNodeIds()), [nodes]);

  // 画布资产按归属笔记分组（null = 全局画布）
  const canvasGroups = useMemo(() => {
    const map = new Map<string | null, CanvasMeta[]>();
    for (const c of canvases) {
      const key = c.noteId ?? null;
      map.set(key, [...(map.get(key) ?? []), c]);
    }
    return [...map.entries()].sort((a, b) => {
      const na = a[0] ? notes.find((n) => n.id === a[0])?.title ?? "" : "全局画布";
      const nb = b[0] ? notes.find((n) => n.id === b[0])?.title ?? "" : "全局画布";
      return na.localeCompare(nb);
    });
  }, [canvases, notes]);

  const noteTitle = (id: string | null | undefined): string => {
    if (!id) return "全局画布";
    return notes.find((n) => n.id === id)?.title ?? "（已删除的笔记）";
  };

  const openNode = (id: string) => {
    setFocus(id);
    setView("notes");
  };

  const openCanvas = (id: string) => {
    setActiveCanvas(id);
    setCanvasOpen(true);
    setView("notes");
  };

  const recycle = (id: string) => {
    const node = readNode(ydoc, id);
    if (!node || node.trashedAt) return;
    upsertNode(ydoc, { ...node, trashedAt: Date.now() });
  };

  const restore = (id: string) => {
    const node = readNode(ydoc, id);
    if (!node) return;
    const { trashedAt: _drop, ...rest } = node;
    upsertNode(ydoc, rest);
  };

  return (
    <div className="view-page">
      <header className="view-head">
        <h2>知识库</h2>
        <p className="view-sub">
          全部笔记共享同一份 Knowledge（{nodes.length} 个节点 · {canvases.length} 张画布）
          —— 资产可拖到任意画布复用。
        </p>
      </header>

      <div className="asset-tabs" role="tablist" aria-label="资产类型">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "nodes"}
          className={`asset-tab${tab === "nodes" ? " active" : ""}`}
          onClick={() => setTab("nodes")}
        >
          节点资产 {nodes.length}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "canvases"}
          className={`asset-tab${tab === "canvases" ? " active" : ""}`}
          onClick={() => setTab("canvases")}
        >
          画布资产 {canvases.length}
        </button>
      </div>

      {tab === "nodes" ? (
        <>
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
            {trashedCount > 0 || trashOpen ? (
              <button
                type="button"
                className={`view-chip${trashOpen ? " active" : ""}`}
                onClick={() => setTrashOpen((v) => !v)}
              >
                🗑 回收站 {trashedCount}
              </button>
            ) : null}
          </div>

          <ul className="view-list" aria-label="节点资产">
            {visible.map((n) => {
              const style = NODE_STYLE[n.kind] ?? NODE_STYLE.concept;
              const undocumented = !documented.has(n.id);
              return (
                <li
                  key={n.id}
                  className="asset-li"
                  draggable
                  title="拖到画布可直接使用这个节点"
                  onDragStart={(e) => {
                    e.dataTransfer.setData(MIME_NODE, n.id);
                    e.dataTransfer.effectAllowed = "copy";
                  }}
                >
                  <button type="button" className="view-row" onClick={() => openNode(n.id)}>
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
                      {trashOpen
                        ? " · 已回收"
                        : undocumented
                          ? <span className="view-row-undoc"> · 未写文档</span>
                          : null}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="asset-row-btn"
                    title={trashOpen ? "恢复资产" : "移入回收站"}
                    aria-label={trashOpen ? "恢复" : "删除"}
                    onClick={() => (trashOpen ? restore(n.id) : recycle(n.id))}
                  >
                    {trashOpen ? "↩" : "🗑"}
                  </button>
                </li>
              );
            })}
            {visible.length === 0 ? <li className="view-empty">没有匹配的节点</li> : null}
          </ul>
        </>
      ) : (
        <>
          <p className="view-sub view-sub-tip">
            画布资产 = 一组已排好的图（节点 + 布局）。拖到当前画布 = 合并；点击 = 打开这张画布。
          </p>
          <button
            type="button"
            className="view-chip"
            onClick={() => {
              const canvas = createCanvas(ydoc, `新画布 ${canvases.length + 1}`, activeNoteId ?? undefined);
              openCanvas(canvas.id);
            }}
          >
            ＋ 新建画布
          </button>
          {canvasGroups.map(([noteId, group]) => (
            <section key={noteId ?? "global"} className="asset-group">
              <h3 className="asset-group-title">{noteTitle(noteId)}</h3>
              <ul className="view-list" aria-label="画布资产">
                {group.map((c) => (
                  <li
                    key={c.id}
                    draggable
                    title={`拖到画布 = 把这 ${c.nodeIds.length} 个节点（含布局）合并过去`}
                    onDragStart={(e) => {
                      e.dataTransfer.setData(MIME_CANVAS, c.id);
                      e.dataTransfer.effectAllowed = "copy";
                    }}
                  >
                    <button type="button" className="view-row" onClick={() => openCanvas(c.id)}>
                      <span className="view-dot view-dot-canvas" />
                      <span className="view-row-main">
                        <span className="view-row-title">{c.title}</span>
                        <span className="view-row-sub">
                          {c.nodeIds.length} 个节点 · 创建于 {timeLabel(c.createdAt)}
                        </span>
                      </span>
                      <span className="view-row-meta">{noteTitle(c.noteId)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {canvasGroups.length === 0 ? (
            <p className="view-empty">还没有画布。在笔记里输入「/」选择「概念画布」创建一张。</p>
          ) : null}
        </>
      )}
    </div>
  );
}