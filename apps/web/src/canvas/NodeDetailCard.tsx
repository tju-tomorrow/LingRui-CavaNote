/**
 * 节点详情卡 —— P1.6 ⭐（PRD/主界面.md §2.6、§5.7，数据见 PRD/知识模型.md §2.1）
 *
 * 「点击节点弹出详情卡：核心作用 / 常见实现 chips / 相关知识链接」。
 * 数据全在 Y.Doc 里（roles / faq / meta.tech / meta.links），此前只是零消费。
 *
 * 跟随全局 focus：
 *   - 画布点节点 → focus → 卡片淡入
 *   - 时间轴播放 / seek → focus 切换 → 卡片跟着切（seek 四联动之一）
 *   - focus 清空 → 淡出
 *
 * FAQ 是活的：点击「问一下」→ askLingRui 把问题塞进聊天面板，
 * 走上同一套「提问 → 答案落盘」的闭环。
 */
import { useState } from "react";
import { NODE_STYLE } from "@lingrui/canvas";
import type { KnowledgeNode } from "@lingrui/knowledge";
import { useKnowledgeNode } from "../collab/useKnowledge";
import { askLingRui } from "../chat/ask";
import { noteFaqQuestion } from "../chat/faq";
import { setFocus, useFocus } from "../state/focus";

const ORIGIN_LABEL: Record<string, string> = {
  ai: "AI 生成",
  human: "你创建",
};

/** 把 A 拖出来形成入场动画（键盘 a11y 友好） */
function useMount(): boolean {
  const [mounted, setMounted] = useState(false);
  if (!mounted) requestAnimationFrame(() => setMounted(true));
  return mounted;
}

function Chips({ items }: { items: readonly string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="nd-chips">
      {items.map((item) => (
        <span key={item} className="nd-chip">
          {item}
        </span>
      ))}
    </div>
  );
}

export function NodeDetailCard() {
  const focus = useFocus();
  const node = useKnowledgeNode(focus ?? undefined);
  const mounted = useMount();

  if (!node) return null;

  const style =
    NODE_STYLE[node.kind] ?? NODE_STYLE.concept ?? { stroke: "#555555", background: "#f3f4f6", icon: "" };
  const tech = (node.meta?.tech as string[] | undefined) ?? [];
  const links =
    (node.meta?.links as Array<{ label: string; href: string }> | undefined) ?? [];
  const roles = node.roles ?? [];
  const faq = node.faq ?? [];
  const hasBody = Boolean(node.summary) || roles.length > 0 || tech.length > 0 || faq.length > 0 || links.length > 0;

  return (
    <aside className={`node-detail${mounted ? " is-in" : ""}`} aria-label={`节点详情：${node.title}`}>
      <header className="nd-head">
        <span className="nd-kind" style={{ background: style.background, color: style.stroke }}>
          {node.kind}
        </span>
        <h3 className="nd-title">{node.title}</h3>
        {node.provenance?.origin ? (
          <span className="nd-origin">{ORIGIN_LABEL[node.provenance.origin] ?? node.provenance.origin}</span>
        ) : null}
        <button
          className="nd-close"
          type="button"
          aria-label="关闭详情卡"
          onClick={() => setFocus(null)}
        >
          ✕
        </button>
      </header>

      {node.summary ? <p className="nd-summary">{node.summary}</p> : null}

      {roles.length > 0 ? (
        <section className="nd-section">
          <h4>核心作用</h4>
          <ul className="nd-roles">
            {roles.map((role, i) => (
              // eslint-disable-next-line react/no-array-index-key -- 静态列表
              <li key={`${role}-${i}`}>{role}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {tech.length > 0 ? (
        <section className="nd-section">
          <h4>常见实现</h4>
          <Chips items={tech} />
        </section>
      ) : null}

      {faq.length > 0 ? (
        <section className="nd-section">
          <h4>相关知识</h4>
          <ul className="nd-faq">
            {faq.map((item) => {
              const question = `关于「${node.title}」：${item.q}`;
              return (
                <li key={item.id}>
                  <div className="nd-faq-row">
                    <span className="nd-faq-q">{item.q}</span>
                    <button
                      className="nd-faq-ask"
                      type="button"
                      onClick={() => {
                        // 登记后提问；答案回来时由 chat/faq 写回 item.a
                        noteFaqQuestion(node.id, item.id, question);
                        askLingRui(question);
                      }}
                    >
                      {item.a ? "重问" : "问一下"}
                    </button>
                  </div>
                  {item.a ? <p className="nd-faq-a">{item.a}</p> : null}
                </li>
              );
            })}
          </ul>
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

      {!hasBody ? <EmptyHint node={node} /> : null}
    </aside>
  );
}

/** 数据还没填的节点：给一句引导，而不是一片空白 */
function EmptyHint({ node }: { node: KnowledgeNode }) {
  return (
    <p className="nd-empty">
      这个节点还没有详情数据。
      <br />
      对我说「把 {node.title} 的核心作用补充一下」，我会边讲边落进文档。
    </p>
  );
}