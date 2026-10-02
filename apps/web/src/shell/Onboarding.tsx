/**
 * 空状态 / first-run（「什么都没有」时看到的东西）
 *
 * 之前空库只有一个「还没有笔记 —— 点右下＋新建笔记」的提示，
 * 用户得先知道要干嘛。这里改成**从一个主题开始**：
 * 输入主题 → 生成 → 画布与笔记一起出现（见 chat/generate.ts）。
 *
 * 也留了两条侧门：先写一篇空白笔记 / 载入示例。
 */
import { useState, type JSX } from "react";
import { createNote } from "@lingrui/knowledge";
import { ydoc, seedDemo } from "../collab/doc";
import { generateFromTopic } from "../chat/generate";
import { setActiveNote } from "../state/notes";
import { IconSparkle } from "./icons";

const EXAMPLES = [
  "Kafka 是怎么工作的",
  "一次 HTTP 请求的完整旅程",
  "MySQL 索引为什么用 B+ 树",
  "Redis 缓存雪崩、击穿与穿透",
  "OAuth2 授权码流程",
];

export function Onboarding(): JSX.Element {
  const [topic, setTopic] = useState("");
  const [busy, setBusy] = useState(false);

  const generate = (value: string): void => {
    const title = value.trim();
    if (!title || busy) return;
    setBusy(true);
    generateFromTopic(title);
    // 画布 / 笔记是立即出现的；按钮只是给一个「已经开动」的反馈
    window.setTimeout(() => setBusy(false), 700);
  };

  const blank = (): void => {
    const note = createNote(ydoc, "未命名笔记");
    setActiveNote(note.id);
  };

  return (
    <div className="onboarding">
      <div className="ob-card">
        <div className="ob-mark">
          <IconSparkle size={22} />
        </div>
        <h1 className="ob-title">从一个主题开始</h1>
        <p className="ob-sub">
          输入一个你想搞懂的主题，LingRui 会画一张会自己讲解的知识画布，并写一篇对应的笔记。
        </p>

        <form
          className="ob-form"
          onSubmit={(e) => {
            e.preventDefault();
            generate(topic);
          }}
        >
          <input
            className="ob-input"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="例如：Kafka 是怎么工作的"
            aria-label="输入主题"
            autoFocus
          />
          <button className="ob-generate" type="submit" disabled={!topic.trim() || busy}>
            {busy ? "生成中…" : "生成画布与讲解"}
          </button>
        </form>

        <div className="ob-examples">
          {EXAMPLES.map((ex) => (
            <button key={ex} type="button" className="ob-example" onClick={() => generate(ex)}>
              {ex}
            </button>
          ))}
        </div>

        <div className="ob-secondary">
          <button type="button" className="ob-link" onClick={blank}>
            先写一篇空白笔记
          </button>
          <span className="ob-dot">·</span>
          <button type="button" className="ob-link" onClick={seedDemo}>
            载入示例
          </button>
        </div>
      </div>
    </div>
  );
}
