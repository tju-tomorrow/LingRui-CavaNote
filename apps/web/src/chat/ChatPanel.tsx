/**
 * AI 助手面板 —— assistant-ui runtime + 自定义 UI
 *
 * 为什么用自定义 UI 而不是 @assistant-ui/react-ui：后者（0.2.1）落后于 react（0.15.x），
 * 而且会再拉一套 Radix。这里只用 assistant-ui 的 runtime（流式、取消、消息仓库），
 * UI 走我们自己的设计语言。
 *
 * TODO(P3)：把 ChatModelAdapter 换成真实 LLM
 *   - 有 VITE_COLLAB_URL 时走 `/api/chat`（AI SDK streamText）
 *   - 用 @lingrui/ai 的 CANVAS_TOOLS 做 tool calling，让模型直接 spawnNode / connect
 */
import { useMemo, useRef, useState } from "react";
import {
  AssistantRuntimeProvider,
  useAui,
  useAuiState,
  useLocalRuntime,
  type ChatModelAdapter,
} from "@assistant-ui/react";
import { buildReply } from "./explain";
import { useFocus } from "../state/focus";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 按 2~4 个字切块，模拟流式输出 */
function* chunks(text: string): Generator<string> {
  let i = 0;
  while (i < text.length) {
    const size = Math.min(2 + Math.floor(Math.random() * 3), text.length - i);
    yield text.slice(i, i + size);
    i += size;
  }
}

function createAdapter(getNodeId: () => string | null): ChatModelAdapter {
  return {
    async *run({ messages, abortSignal }) {
      const last = messages.at(-1);
      const question =
        last?.content
          .filter((p): p is { type: "text"; text: string } => p.type === "text")
          .map((p) => p.text)
          .join("") ?? "";

      const reply = buildReply(question, getNodeId());

      // 注意：assistant-ui 的 local runtime 对每次 yield 是「覆盖」而非「追加」
      // （内部是 [...initialContent, ...m.content]，initialContent 只在 run 开始时取一次）。
      // 所以每块必须带上**到目前为止的全文**，否则只会看到最后一块。
      let accumulated = "";
      for (const chunk of chunks(reply)) {
        if (abortSignal.aborted) return;
        await sleep(14);
        accumulated += chunk;
        yield { content: [{ type: "text" as const, text: accumulated }] };
      }
    },
  };
}

function Messages() {
  const messages = useAuiState((s) => s.thread.messages);

  if (messages.length === 0) {
    return (
      <div className="chat-empty">
        你可以点击画布中的节点，
        <br />
        我会为你生成详细的解释笔记。
      </div>
    );
  }

  return (
    <div className="chat-messages">
      {messages.map((m) => {
        const text = m.content
          .filter((p): p is { type: "text"; text: string } => p.type === "text")
          .map((p) => p.text)
          .join("");
        if (!text) return null;
        return (
          <div key={m.id} className={`chat-msg chat-msg-${m.role}`}>
            {text}
          </div>
        );
      })}
    </div>
  );
}

function Composer() {
  const aui = useAui();
  const isRunning = useAuiState((s) => s.thread.isRunning);
  const [text, setText] = useState("");

  const send = () => {
    const value = text.trim();
    if (!value || isRunning) return;
    setText("");
    aui.thread.append(value);
  };

  return (
    <form
      className="chat-composer"
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
    >
      <input
        className="chat-input"
        value={text}
        placeholder="向 LingRui 询问关于这个知识点…"
        onChange={(e) => setText(e.target.value)}
      />
      <button className="chat-send" type="submit" disabled={isRunning || !text.trim()}>
        ➤
      </button>
    </form>
  );
}

export function ChatPanel() {
  const focusRef = useRef<string | null>(null);
  focusRef.current = useFocus();

  const adapter = useMemo(() => createAdapter(() => focusRef.current), []);
  const runtime = useLocalRuntime(adapter);

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <Messages />
      <Composer />
    </AssistantRuntimeProvider>
  );
}
