/**
 * 远端 LLM 客户端 —— 只依赖 fetch，不引入任何 SDK
 *
 * 与服务端 apps/collab/src/chat.ts 的 NDJSON 协议一一对应。
 */
import { CHAT_API, remoteEnabled } from "./config";
import { currentToken } from "../collab/token";

// 地址解析放在 ./config，避免与 auth/store 形成循环依赖；这里原样转出。
export { CHAT_API, remoteEnabled };

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export type RemoteEvent =
  | { type: "text"; delta: string }
  | { type: "tool"; name: string; arguments: unknown }
  | { type: "error"; message: string }
  | { type: "done" };

/**
 * /api/chat 非 2xx 时抛出，带上 HTTP status。
 * 让调用方能把「需要登录（401）」「未配置 LLM（503）」等分别讲清楚。
 */
export class ChatApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ChatApiError";
    this.status = status;
  }
}

/** 桌面端桥（preload 注入）；web 版不存在 */
const bridge = typeof window === "undefined" ? undefined : window.lingrui;

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
  const token = currentToken();
  const response = await fetch(CHAT_API, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      // 桌面端内嵌服务用一次性 token；web 端登录后带上登录 token。
      // 未登录时也带上回退 token（VITE_COLLAB_TOKEN）——它与 WebSocket 用的是同一份，
      // 否则 /api/chat 会 401，AI 直接不可用，看起来像「根本没接上」。
      ...(bridge?.token ? { "x-lingrui-token": bridge.token } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ messages, ...extras }),
    signal,
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    // 带 status 抛出：调用方据此区分「需要登录 / 未配置」等，给出可见提示，
    // 而不是把所有失败都装成同一种"静默降级"。
    throw new ChatApiError(`chat api ${response.status}: ${detail.slice(0, 200)}`, response.status);
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
