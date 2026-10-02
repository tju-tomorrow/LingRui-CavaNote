/**
 * 节点详情卡 —— P1.6 ⭐（PRD/主界面.md §2.6、§5.7，数据见 PRD/知识模型.md §2.1）
 *
 * 「点击节点弹出详情卡：核心作用 / 常见实现 chips / 相关知识链接」。
 * 数据全在 Y.Doc 里（roles / faq / meta.tech / meta.links）。
 *
 * 跟随全局 focus：
 *   - 画布点节点 → focus → 卡片淡入
 *   - 时间轴播放 / seek → focus 切换 → 卡片跟着切（seek 四联动之一）
 *   - focus 清空 → 淡出
 *
 * 两种模式：
 *   - 阅读：AI 写的内容 + FAQ「问一下」（答案落盘见 chat/faq.ts）
 *   - 编辑（✎）：标题 / 摘要 / 核心作用 / 常见实现 / 相关知识 都能手改
 *
 * 为什么手改要标 `markHuman`：ADR-0011 的不变量 1「人的编辑是权威的」——
 * 标过之后 AI 再想覆盖就会走三级保险的「待确认」，不会静默抹掉你的修改。
 *
 * 编辑策略：本地 draft 驱动输入框（光标不会跳），每次改动立刻写 Y.Doc（Yjs 很便宜）。
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { NODE_STYLE, type NodeStyleOverride } from "@lingrui/canvas";
import {
  markHuman,
  readNode,
  upsertNode,
  type FaqItem,
  type KnowledgeNode,
} from "@lingrui/knowledge";
import { useKnowledgeNode } from "../collab/useKnowledge";
import { askLingRui } from "../chat/ask";
import { noteFaqQuestion } from "../chat/faq";
import { ydoc } from "../collab/doc";
import { useReadOnlyShare } from "../shell/share";
import { setFocus, useFocus } from "../state/focus";
import { useCanvasVersion } from "./bridge";
import { revealNode } from "../editor/bridge";
import { canvasViewportSize, nodeOverlayRect } from "./geometry";

const ORIGIN_LABEL: Record<string, string> = {
  ai: "AI 生成",
  human: "你创建",
};

interface Draft {
  title: string;
  summary: string;
  roles: string[];
  tech: string[];
  faq: FaqItem[];
  tags: string[];
  /** 资产级画布形态预设（ADR-0014 §3） */
  style?: NodeStyleOverride;
}

function toDraft(node: KnowledgeNode): Draft {
  return {
    title: node.title,
    summary: node.summary ?? "",
    roles: [...(node.roles ?? [])],
    tech: Array.isArray(node.meta?.["tech"]) ? [...(node.meta["tech"] as string[])] : [],
    faq: (node.faq ?? []).map((f) => ({ ...f })),
    tags: [...(node.tags ?? [])],
    style:
      typeof node.meta?.["style"] === "object" && node.meta["style"] !== null
        ? (node.meta["style"] as NodeStyleOverride)
        : undefined,
  };
}

/** 挂载动画（键盘 a11y 友好） */
function useMount(): boolean {
  const [mounted, setMounted] = useState(false);
  if (!mounted) requestAnimationFrame(() => setMounted(true));
  return mounted;
}

let uid = 0;
const nextId = (prefix: string): string => `${prefix}-${Date.now().toString(36)}-${(uid += 1)}`;

/** 资产外观预设色卡（画布形态，ADR-0014） */
const STYLE_PRESETS: Array<{ label: string; fillColor: string; strokeColor: string }> = [
  { label: "靛蓝", fillColor: "#eef2ff", strokeColor: "#4f46e5" },
  { label: "翠绿", fillColor: "#ecfdf5", strokeColor: "#059669" },
  { label: "琥珀", fillColor: "#fffbeb", strokeColor: "#d97706" },
  { label: "玫红", fillColor: "#fdf2f8", strokeColor: "#db2777" },
  { label: "石板", fillColor: "#f8fafc", strokeColor: "#475569" },
];

export function NodeDetailCard() {
  const focus = useFocus();
  const node = useKnowledgeNode(focus ?? undefined);
  const mounted = useMount();
  const readOnly = useReadOnlyShare();
  const canvasVersion = useCanvasVersion();

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [dirty, setDirty] = useState(false);
  /**
   * 用户**真正碰过**的字段。
   *
   * 只靠「草稿 vs 节点」求差是不够的：草稿一旦过期（比如节点在编辑期间被 AI 更新过），
   * 求差就会把没碰过的字段也判成「改了」，然后用草稿里的旧值把它写空 ——
   * 实测「加一条核心作用」会顺手清空 FAQ。
   * 记下碰过谁，就只写谁。
   */
  const touchedRef = useRef(new Set<keyof Draft>());
  /** 最新草稿（防抖提交 + 切节点时刷盘要用） */
  const draftRef = useRef<Draft | null>(null);
  const nodeIdRef = useRef<string | undefined>(undefined);

  /**
   * 写回 Y.Doc —— **只写真正变了的字段**。
   *
   * 早先是「每次按键整节点写回」：协同下很吵，而且会用手里那份旧快照
   * 覆盖别人并发改的其它字段（KnowledgeNode 是整对象 LWW）。
   */
  const flush = (d: Draft, nodeId: string) => {
    const fresh = readNode(ydoc, nodeId);
    if (!fresh) return;

    const touched = touchedRef.current;
    const next: Partial<Draft> = {};
    // 只写「用户碰过」的字段，且确实与当前值不同
    if (touched.has("title") && d.title !== fresh.title) next.title = d.title;
    if (touched.has("summary") && d.summary !== (fresh.summary ?? "")) next.summary = d.summary;
    if (touched.has("roles") && JSON.stringify(d.roles) !== JSON.stringify(fresh.roles ?? [])) {
      next.roles = d.roles;
    }
    if (touched.has("faq") && JSON.stringify(d.faq) !== JSON.stringify(fresh.faq ?? [])) {
      next.faq = d.faq;
    }
    if (touched.has("tags") && JSON.stringify(d.tags) !== JSON.stringify(fresh.tags ?? [])) {
      next.tags = d.tags;
    }
    const freshTech = Array.isArray(fresh.meta?.["tech"]) ? (fresh.meta["tech"] as string[]) : [];
    if (touched.has("tech") && JSON.stringify(d.tech) !== JSON.stringify(freshTech)) {
      next.tech = d.tech;
    }

    if (Object.keys(next).length === 0) {
      touched.clear();
      return;
    }
    touched.clear();

    if (
      touched.has("style") &&
      JSON.stringify(d.style ?? null) !== JSON.stringify(fresh.meta?.["style"] ?? null)
    ) {
      next.style = d.style;
    }

    const meta = { ...(fresh.meta ?? {}) };
    if (next.tech) meta["tech"] = next.tech;
    if (next.style) meta["style"] = next.style;
    else if ("style" in next) delete meta["style"];

    upsertNode(ydoc, {
      ...fresh,
      title: next.title ?? fresh.title,
      summary: next.summary ?? fresh.summary,
      roles: next.roles ?? fresh.roles,
      faq: next.faq ?? fresh.faq,
      tags: next.tags ?? fresh.tags,
      meta,
    });
    // 人的编辑是权威的（ADR-0011 不变量 1）：标过之后 AI 想改就得走待确认
    markHuman(ydoc, nodeId);
  };

  // 换节点：先把上一份草稿刷盘，再重置（不丢最后的输入）
  useEffect(() => {
    if (draftRef.current && nodeIdRef.current && dirty) {
      flush(draftRef.current, nodeIdRef.current);
    }
    nodeIdRef.current = node?.id;
    draftRef.current = node ? toDraft(node) : null;
    setDraft(draftRef.current);
    setEditing(false);
    setDirty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 只在换节点时跑
  }, [node?.id]);

  // 非编辑态下跟随外部更新（AI 改了节点，卡片应该跟着变）
  useEffect(() => {
    if (editing || dirty || !node) return;
    const next = toDraft(node);
    draftRef.current = next;
    setDraft(next);
  }, [node, editing, dirty]);

  // 防抖提交：停手 500ms 后写一次，而不是每个字符一次
  useEffect(() => {
    if (!dirty || !draft || !node) return;
    const timer = window.setTimeout(() => {
      flush(draft, node.id);
      setDirty(false);
    }, 500);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- flush 只依赖 draft/node
  }, [draft, dirty, node?.id]);

  // ⚠️ 以下 hook 必须在任何 early-return **之前**调用（Rules of Hooks）——
  // 否则「先有聚焦节点、再取消聚焦」时 hook 数量变化，React 会直接崩掉整棵树。
  const cardRef = useRef<HTMLElement | null>(null);
  const [place, setPlace] = useState<{ left: number; top: number; side: "left" | "right" } | null>(
    null,
  );

  const d = node ? (draft ?? toDraft(node)) : null;
  const links =
    (node?.meta?.links as Array<{ label: string; href: string }> | undefined) ?? [];

  const contentKey = [
    node?.id,
    editing ? "edit" : "read",
    d?.roles.length ?? 0,
    d?.tech.length ?? 0,
    d?.faq.length ?? 0,
    links.length,
    (d?.summary.length ?? 0) > 0,
  ].join(":");

  /**
   * 卡片位置：**锚定到它所解释的那个节点旁边**。
   *
   * 之前固定在画布右上角 —— 节点在左下角时，卡片和它解释的东西毫无视觉关联，
   * 用户得自己找「这张卡说的是哪个框」。
   *
   * 规则：优先放节点右侧；右边放不下就翻到左侧；垂直居中于节点并夹在画布内。
   * 节点不在视野里时退回停靠（右上角），并给一句提示。
   */
  useLayoutEffect(() => {
    if (!node) {
      setPlace(null);
      return;
    }
    const rect = nodeOverlayRect(node.id);
    if (!rect) {
      setPlace(null); // 节点不在场景里 → 退回停靠
      return;
    }

    const viewport = canvasViewportSize();

    // 节点在画布外（用户平移/缩放走了）→ 锚定到画布边缘只会让人困惑
    // （「这卡说的是哪个框？」），所以同样退回停靠 + 提示。
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const offscreen = cx < 0 || cx > viewport.width || cy < 0 || cy > viewport.height;
    if (offscreen) {
      setPlace(null);
      return;
    }
    const card = cardRef.current;
    const width = card?.offsetWidth || 320;
    const height = card?.offsetHeight || 320;
    const gap = 18;
    const margin = 12;

    // 优先右侧；右边真放不下再翻左侧
    let side: "left" | "right" = "right";
    let left = rect.left + rect.width + gap;
    if (left + width + margin > viewport.width) {
      side = "left";
      left = rect.left - gap - width;
    }
    // 两侧都放不下（节点很宽 / 画布很窄）→ 贴在较空的一侧
    left = Math.max(margin, Math.min(left, viewport.width - width - margin));

    let top = rect.top + rect.height / 2 - height / 3;
    top = Math.max(margin, Math.min(top, viewport.height - height - margin));

    setPlace({ left, top, side });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 内容尺寸变了要重新夹取
  }, [node?.id, canvasVersion, contentKey]);

  if (!node || !d) return null;

  const style =
    NODE_STYLE[node.kind] ??
    NODE_STYLE.concept ?? { stroke: "#555555", background: "#f3f4f6", icon: "" };

  const patch = (next: Partial<Draft>) => {
    for (const key of Object.keys(next) as Array<keyof Draft>) touchedRef.current.add(key);
    const merged = { ...(draftRef.current ?? d), ...next };
    draftRef.current = merged;
    setDraft(merged);
    setDirty(true);
  };

  const hasBody =
    Boolean(node.summary) ||
    d.roles.length > 0 ||
    d.tech.length > 0 ||
    d.faq.length > 0 ||
    links.length > 0;

  return (
    <aside
      ref={cardRef}
      className={`node-detail${mounted ? " is-in" : ""}${editing ? " is-editing" : ""}${
        place ? ` is-anchored is-${place.side}` : " is-docked"
      }`}
      style={place ? { left: place.left, top: place.top } : undefined}
      aria-label={`节点详情：${node.title}`}
    >
      <header className="nd-head">
        <span className="nd-kind" style={{ background: style.background, color: style.stroke }}>
          {node.kind}
        </span>
        {editing ? (
          <input
            className="nd-title-input"
            value={d.title}
            aria-label="节点标题"
            onChange={(e) => patch({ title: e.target.value })}
          />
        ) : (
          <h3 className="nd-title">{node.title}</h3>
        )}
        {node.provenance?.origin ? (
          <span className="nd-origin">
            {ORIGIN_LABEL[node.provenance.origin] ?? node.provenance.origin}
          </span>
        ) : null}
        {readOnly ? null : (
          <button
            className={`nd-edit${editing ? " is-on" : ""}`}
            type="button"
            title={editing ? "完成编辑" : "编辑这个节点"}
            onClick={() => setEditing((v) => !v)}
          >
            {editing ? "✓" : "✎"}
          </button>
        )}
        <button
          className="nd-close"
          type="button"
          aria-label="关闭详情卡"
          onClick={() => setFocus(null)}
        >
          ✕
        </button>
      </header>

      {editing ? (
        <textarea
          className="nd-summary-input"
          value={d.summary}
          aria-label="一句话说明"
          placeholder="一句话说明这个节点干什么…"
          rows={2}
          onChange={(e) => patch({ summary: e.target.value })}
        />
      ) : node.summary ? (
        <p className="nd-summary">{node.summary}</p>
      ) : null}

      {/* 长文正文入口（ADR-0014 §4.3：资产像笔记一样，正文在文档块） */}
      {!editing && (node.blockIds?.length || node.blockId) ? (
        <button type="button" className="nd-body-btn" onClick={() => revealNode(node.id)}>
          打开正文 ↗
        </button>
      ) : null}

      {/* ---- 核心作用 ---- */}
      {editing || d.roles.length > 0 ? (
        <section className="nd-section">
          <h4>核心作用</h4>
          {editing ? (
            <ul className="nd-roles nd-roles-edit">
              {d.roles.map((role, i) => (
                <li key={`${role}-${i}`}>
                  <input
                    className="nd-line-input"
                    value={role}
                    aria-label={`核心作用 ${i + 1}`}
                    onChange={(e) => {
                      const roles = [...d.roles];
                      roles[i] = e.target.value;
                      patch({ roles });
                    }}
                  />
                  <button
                    className="nd-del"
                    type="button"
                    title="删除这条"
                    onClick={() => patch({ roles: d.roles.filter((_, j) => j !== i) })}
                  >
                    ✕
                  </button>
                </li>
              ))}
              <li>
                <button
                  className="nd-add"
                  type="button"
                  onClick={() => patch({ roles: [...d.roles, ""] })}
                >
                  ＋ 添加要点
                </button>
              </li>
            </ul>
          ) : (
            <ul className="nd-roles">
              {d.roles.map((role, i) => (
                // eslint-disable-next-line react/no-array-index-key -- 静态列表
                <li key={`${role}-${i}`}>{role}</li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {/* ---- 常见实现 ---- */}
      {editing || d.tech.length > 0 ? (
        <section className="nd-section">
          <h4>常见实现</h4>
          <div className="nd-chips">
            {d.tech.map((tech, i) => (
              <span key={`${tech}-${i}`} className="nd-chip">
                {tech}
                {editing ? (
                  <button
                    className="nd-chip-del"
                    type="button"
                    title="移除"
                    onClick={() => patch({ tech: d.tech.filter((_, j) => j !== i) })}
                  >
                    ✕
                  </button>
                ) : null}
              </span>
            ))}
            {editing ? (
              <input
                className="nd-chip-input"
                placeholder="＋ 添加（回车）"
                aria-label="添加常见实现"
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  const value = e.currentTarget.value.trim();
                  if (!value) return;
                  e.currentTarget.value = "";
                  patch({ tech: [...d.tech, value] });
                }}
              />
            ) : null}
          </div>
        </section>
      ) : null}

      {/* ---- 外观（资产画布形态） ---- */}
      {editing ? (
        <section className="nd-section">
          <h4>外观（画布形态）</h4>
          <div className="nd-swatches">
            <button
              type="button"
              className="nd-swatch nd-swatch-default"
              title="恢复类型默认配色"
              onClick={() => patch({ style: undefined })}
            >
              默认
            </button>
            {STYLE_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                className="nd-swatch"
                title={preset.label}
                onClick={() =>
                  patch({ style: { fillColor: preset.fillColor, strokeColor: preset.strokeColor } })
                }
                style={{ background: preset.fillColor, borderColor: preset.strokeColor }}
              />
            ))}
          </div>
        </section>
      ) : null}

      {/* ---- 相关知识 ---- */}
      {editing || d.faq.length > 0 ? (
        <section className="nd-section">
          <h4>相关知识</h4>
          <ul className="nd-faq">
            {d.faq.map((item, i) => {
              const question = `关于「${node.title}」：${item.q}`;
              return (
                <li key={item.id}>
                  {editing ? (
                    <>
                      <div className="nd-faq-row">
                        <input
                          className="nd-line-input"
                          value={item.q}
                          aria-label={`问题 ${i + 1}`}
                          onChange={(e) => {
                            const faq = d.faq.map((f) =>
                              f.id === item.id ? { ...f, q: e.target.value } : f,
                            );
                            patch({ faq });
                          }}
                        />
                        <button
                          className="nd-del"
                          type="button"
                          title="删除这个问题"
                          onClick={() => patch({ faq: d.faq.filter((f) => f.id !== item.id) })}
                        >
                          ✕
                        </button>
                      </div>
                      <textarea
                        className="nd-answer-input"
                        value={item.a ?? ""}
                        aria-label={`答案 ${i + 1}`}
                        placeholder="答案（留空则点「问一下」让 AI 现场回答）"
                        rows={2}
                        onChange={(e) => {
                          const faq = d.faq.map((f) =>
                            f.id === item.id ? { ...f, a: e.target.value } : f,
                          );
                          patch({ faq });
                        }}
                      />
                    </>
                  ) : (
                    <>
                      <div className="nd-faq-row">
                        <span className="nd-faq-q">{item.q}</span>
                        {/* 只读视图不给「问一下」：那会触发 AI 写 Y.Doc */}
                        {readOnly ? null : (
                          <button
                            className="nd-faq-ask"
                            type="button"
                            onClick={() => {
                              noteFaqQuestion(node.id, item.id, question);
                              askLingRui(question);
                            }}
                          >
                            {item.a ? "重问" : "问一下"}
                          </button>
                        )}
                      </div>
                      {item.a ? <p className="nd-faq-a">{item.a}</p> : null}
                    </>
                  )}
                </li>
              );
            })}
            {editing ? (
              <li>
                <button
                  className="nd-add"
                  type="button"
                  onClick={() => patch({ faq: [...d.faq, { id: nextId("faq"), q: "" }] })}
                >
                  ＋ 添加问题
                </button>
              </li>
            ) : null}
          </ul>
        </section>
      ) : null}

      {/* ---- 标签（横切索引页读的就是它） ---- */}
      {editing || d.tags.length > 0 ? (
        <section className="nd-section">
          <h4>标签</h4>
          <div className="nd-chips">
            {d.tags.map((tag, i) => (
              <span key={`${tag}-${i}`} className="nd-chip">
                #{tag}
                {editing ? (
                  <button
                    className="nd-chip-del"
                    type="button"
                    title="移除"
                    onClick={() => patch({ tags: d.tags.filter((_, j) => j !== i) })}
                  >
                    ✕
                  </button>
                ) : null}
              </span>
            ))}
            {editing ? (
              <input
                className="nd-chip-input"
                placeholder="＋ 标签（回车）"
                aria-label="添加标签"
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  const value = e.currentTarget.value.trim().replace(/^#/, "");
                  if (!value || d.tags.includes(value)) return;
                  e.currentTarget.value = "";
                  patch({ tags: [...d.tags, value] });
                }}
              />
            ) : null}
          </div>
        </section>
      ) : null}

      {links.length > 0 ? (
        <section className="nd-section">
          <h4>延伸阅读</h4>
          <ul className="nd-links">
            {links.map((link) => (
              <li key={link.href}>
                <a href={link.href} target="_blank" rel="noreferrer">
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {!place ? <p className="nd-offscreen">这个节点不在视野里 · 卡片已停靠到角落</p> : null}

      {!hasBody && !editing ? <EmptyHint node={node} /> : null}
    </aside>
  );
}

/** 数据还没填的节点：给一句引导，而不是一片空白 */
function EmptyHint({ node }: { node: KnowledgeNode }) {
  return (
    <p className="nd-empty">
      这个节点还没有详情数据。
      <br />
      点右上角 ✎ 手动补，或对我说「把 {node.title} 的核心作用补充一下」。
    </p>
  );
}
