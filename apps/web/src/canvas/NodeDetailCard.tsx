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
import { useEffect, useState } from "react";
import { NODE_STYLE } from "@lingrui/canvas";
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
import { isReadOnlyShare } from "../shell/share";
import { setFocus, useFocus } from "../state/focus";

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
}

function toDraft(node: KnowledgeNode): Draft {
  return {
    title: node.title,
    summary: node.summary ?? "",
    roles: [...(node.roles ?? [])],
    tech: Array.isArray(node.meta?.["tech"]) ? [...(node.meta["tech"] as string[])] : [],
    faq: (node.faq ?? []).map((f) => ({ ...f })),
    tags: [...(node.tags ?? [])],
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

export function NodeDetailCard() {
  const focus = useFocus();
  const node = useKnowledgeNode(focus ?? undefined);
  const mounted = useMount();
  const readOnly = isReadOnlyShare();

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);

  // 只在「换了个节点」时重置草稿：否则 AI 更新会打断正在输入的内容
  useEffect(() => {
    setDraft(node ? toDraft(node) : null);
    setEditing(false);
  }, [node?.id]);

  if (!node) return null;

  const style =
    NODE_STYLE[node.kind] ??
    NODE_STYLE.concept ?? { stroke: "#555555", background: "#f3f4f6", icon: "" };
  const d = draft ?? toDraft(node);

  /** 写回 Y.Doc：只改传进来的字段，并标为人改过 */
  const commit = (patch: Partial<Draft>) => {
    const fresh = readNode(ydoc, node.id);
    if (!fresh) return;
    const meta = { ...(fresh.meta ?? {}) };
    if (patch.tech) meta["tech"] = patch.tech;

    upsertNode(ydoc, {
      ...fresh,
      title: patch.title ?? fresh.title,
      summary: patch.summary ?? fresh.summary,
      roles: patch.roles ?? fresh.roles,
      faq: patch.faq ?? fresh.faq,
      tags: patch.tags ?? fresh.tags,
      meta,
    });
    markHuman(ydoc, node.id);
  };

  const patch = (next: Partial<Draft>) => {
    setDraft((prev) => (prev ? { ...prev, ...next } : prev));
    commit(next);
  };

  const links =
    (node.meta?.links as Array<{ label: string; href: string }> | undefined) ?? [];
  const hasBody =
    Boolean(node.summary) ||
    d.roles.length > 0 ||
    d.tech.length > 0 ||
    d.faq.length > 0 ||
    links.length > 0;

  return (
    <aside
      className={`node-detail${mounted ? " is-in" : ""}${editing ? " is-editing" : ""}`}
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
