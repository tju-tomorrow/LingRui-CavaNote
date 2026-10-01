/**
 * 远端 LLM 客户端 —— 只依赖 fetch，不引入任何 SDK
 *
 * 与服务端 apps/collab/src/chat.ts 的 NDJSON 协议一一对应。
 */

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export type RemoteEvent =
  | { type: "text"; delta: string }
  | { type: "tool"; name: string; arguments: unknown }
  | { type: "error"; message: string }
  | { type: "done" };

/** 桌面端桥（preload 注入）；web 版不存在 */
const bridge = typeof window === "undefined" ? undefined : window.lingrui;

/**
 * 后端目标解析顺序：
 *   1. 桌面端内嵌服务（随机端口 + 一次性 token，Key 只在主进程）
 *   2. web 版：Vite 代理的 /api/chat
 *   3. 显式设 "off" 可强制只用本地 planner
 */
export const CHAT_API: string =
  bridge?.chatApi ?? (import.meta.env.VITE_CHAT_API as string | undefined) ?? "/api/chat";

export const remoteEnabled = CHAT_API !== "off";

export interface RemoteExtras {
  /** 结构化画布上下文（已渲染成文本，见 snapshotToPrompt） */
  context?: string;
  /** data URL 截图 */
  image?: string;
}

export async function* streamRemote(
  messages: ChatMessage[],
  signal: AbortSignal,
  extras: RemoteExtras = {},
): AsyncGenerator<RemoteEvent> {
  const response = await fetch(CHAT_API, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(bridge?.token ? { "x-lingrui-token": bridge.token } : {}),
    },
    body: JSON.stringify({ messages, ...extras }),
    signal,
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    // 503 = 服务端没配 LLM，属于"正常的降级信号"，不要把整段错误抛给用户
    throw new Error(`chat api ${response.status}: ${detail.slice(0, 200)}`);
  }
  if (!response.body) throw new Error("chat api 没有响应体");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        yield JSON.parse(trimmed) as RemoteEvent;
      } catch {
        // 半个 JSON 就丢掉，等下一轮补齐
      }
    }
  }
}
