/**
 * AI 助手面板 —— assistant-ui runtime + 自定义 UI
 *
 * 为什么用自定义 UI 而不是 @assistant-ui/react-ui：后者（0.2.1）落后于 react（0.15.x），
 * 而且会再拉一套 Radix。这里只用 assistant-ui 的 runtime（流式、取消、消息仓库），
 * UI 走我们自己的设计语言。
 *
 * 模型来源（见 chat/remote.ts）：
 *   1. 优先 /api/chat（apps/collab 代理任何 OpenAI 兼容后端）
 *   2. 不可用时静默降级到本地 planner —— 两条路径共用同一套画布工具
 */
import { useMemo, useState } from "react";
import {
  AssistantRuntimeProvider,
  useAui,
  useAuiState,
  useLocalRuntime,
  type ChatModelAdapter,
} from "@assistant-ui/react";
import { runAgent, runToolCall } from "./agent";
import { chunks, sleep, textOf } from "./text";
import { remoteEnabled, streamRemote, type ChatMessage } from "./remote";
import { freezeCanvasContext } from "../canvas/context";
import { insertKnowledgeCard } from "../editor/bridge";
import { useFocus } from "../state/focus";
import { snapshotToPrompt, applyPending } from "@lingrui/ai";
import { ydoc } from "../collab/doc";
import { useUndoState, undoRound } from "../state/history";
import {
  resolvePending,
  clearPending,
  usePendingPatches,
  type PendingPatch,
} from "../state/pending";

function createAdapter(): ChatModelAdapter {
  // 上一次远端是否可用。为 false 时不再截屏（截屏有成本），
  // 但仍会尝试请求——服务一旦起来就会自动恢复。
  let remoteHealthy: boolean | null = null;

  return {
    async *run({ messages, abortSignal }) {
      const question =
        [...messages].reverse().find((m) => m.role === "user")
          ? textOf([...messages].reverse().find((m) => m.role === "user")!)
          : "";

      const payload: ChatMessage[] = messages
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({ role: m.role as "user" | "assistant", content: textOf(m) }))
        .filter((m) => m.content.length > 0);

      // ---- 路径 1：真实 LLM ----
      if (remoteEnabled) {
        // 冻结上下文：截图 + 可寻址数据，两者同版本（ADR-0011 决策 4）
        const frozen =
          remoteHealthy === false
            ? null
            : await freezeCanvasContext().catch(() => null);
        const extras = frozen
          ? { context: snapshotToPrompt(frozen.snapshot), image: frozen.screenshot }
          : {};

        let accumulated = "";
        let started = false;
        try {
          for await (const event of streamRemote(payload, abortSignal, extras)) {
            if (event.type === "text") {
              started = true;
              accumulated += event.delta;
              yield { content: [{ type: "text" as const, text: accumulated }] };
            } else if (event.type === "tool") {
              started = true;
              accumulated += runToolCall(event.name, event.arguments);
              yield { content: [{ type: "text" as const, text: accumulated }] };
            } else if (event.type === "error") {
              throw new Error(event.message);
            }
          }
          if (accumulated.trim()) {
            remoteHealthy = true;
            return;
          }
        } catch (error) {
          remoteHealthy = false;
          if (started) {
            // 已经输出过内容，不再拼接本地回复，避免两段话打架
            yield {
              content: [
                { type: "text" as const, text: `${accumulated}\n\n（模型中断：${String(error)}）` },
              ],
            };
            return;
          }
          // 还没输出任何东西 → 静默降级
        }
      }

      // ---- 路径 2：本地 planner ----
      // assistant-ui 的 local runtime 对每次 yield 是「覆盖」而非「追加」
      // （内部是 [...initialContent, ...m.content]，initialContent 只在 run 开始时取一次）。
      // 所以每块必须带上截至目前的全文字。
      const reply = runAgent(question).reply;
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

function PendingPatches() {
  const patches = usePendingPatches();
  if (patches.length === 0) return null;

  const accept = (patch: PendingPatch) => {
    applyPending({ doc: ydoc, t: 0 }, patch.call);
    resolvePending(patch.id);
  };

  const acceptAll = () => {
    for (const patch of patches) applyPending({ doc: ydoc, t: 0 }, patch.call);
    clearPending();
  };

  return (
    <div className="pending-panel">
      <div className="pending-head">
        待确认改动（{patches.length}）· AI 想改你动过的内容
      </div>
      {patches.map((patch) => (
        <div key={patch.id} className="pending-item">
          <span className={`pending-risk pending-risk-${patch.risk}`}>{patch.risk}</span>
          <span className="pending-reason">{patch.reason}</span>
          <button type="button" className="pending-btn" onClick={() => accept(patch)}>
            接受
          </button>
          <button type="button" className="pending-btn" onClick={() => resolvePending(patch.id)}>
            忽略
          </button>
        </div>
      ))}
      {patches.length > 1 ? (
        <button type="button" className="pending-btn pending-all" onClick={acceptAll}>
          全部接受
        </button>
      ) : null}
    </div>
  );
}

function Messages() {
  const messages = useAuiState((s) => s.thread.messages);
  const focus = useFocus();

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
        const text = textOf(m);
        if (!text) return null;
        return (
          <div key={m.id} className={`chat-msg chat-msg-${m.role}`}>
            {text}
            {/* 知识落盘：把当前聚焦的节点写进文档 */}
            {m.role === "assistant" && focus ? (
              <button
                className="chat-insert"
                type="button"
                onClick={() => insertKnowledgeCard(focus)}
              >
                ＋ 插入到笔记
              </button>
            ) : null}
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
  const undo = useUndoState();

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
      <button
        className="chat-send"
        type="button"
        disabled={!undo.canUndo}
        title="撤销本轮 AI 改动（跨文档与画布）"
        onClick={() => undoRound()}
      >
        ↶
      </button>
      <button className="chat-send" type="submit" disabled={isRunning || !text.trim()}>
        ➤
      </button>
    </form>
  );
}

export function ChatPanel() {
  const adapter = useMemo(() => createAdapter(), []);
  const runtime = useLocalRuntime(adapter);

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <Messages />
      <PendingPatches />
      <Composer />
    </AssistantRuntimeProvider>
  );
}
