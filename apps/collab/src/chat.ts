/**
 * /api/chat —— 真实 LLM 的代理与转码
 *
 * 为什么手写而不是上 AI SDK：
 *   这是一个**纯代理**：把 OpenAI 兼容接口的 SSE 转成 NDJSON，客户端不需要任何 SDK。
 *   好处是能接任何 OpenAI 兼容后端（OpenAI / DeepSeek / Groq / Ollama / vLLM）。
 *
 * 协议（每行一个 JSON）：
 *   {"type":"text","delta":"..."}                 文本增量
 *   {"type":"tool","name":"spawnNode","arguments":{...}}  模型请求调用画布工具
 *   {"type":"error","message":"..."}              出错
 *   {"type":"done"}                               结束
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { CANVAS_TOOLS, SYSTEM_PROMPT } from "@lingrui/ai";

const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_MODEL = "gpt-4o-mini";

/** 每次调用时读 env，方便测试与热更新 */
function llmConfig() {
  return {
    baseUrl: process.env.OPENAI_BASE_URL ?? DEFAULT_BASE_URL,
    model: process.env.LLM_MODEL ?? DEFAULT_MODEL,
    apiKey: process.env.OPENAI_API_KEY ?? "",
    // 部分网关（opencode-go 等）要求会话标头；未设置则不发
    session: process.env.LLM_SESSION ?? "",
  };
}

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

async function readJson(
  req: IncomingMessage,
): Promise<{ messages?: ChatMessage[]; context?: string; image?: string }> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? (JSON.parse(raw) as { messages?: ChatMessage[]; context?: string; image?: string }) : {};
}

/**
 * 把画布上下文拼进最后一条 user 消息（ADR-0011 决策 4）。
 * 顺序：用户原话 → 可寻址数据 → 截图。
 * 模型先拿到 id 体系，再用截图对齐视觉意图。
 */
function buildOpenAiMessages(
  messages: ChatMessage[],
  context?: string,
  image?: string,
): unknown[] {
  const lastUserIndex = messages.reduce(
    (found, message, index) => (message.role === "user" ? index : found),
    -1,
  );

  return messages.map((message, index) => {
    if (index !== lastUserIndex || (!context && !image)) return message;

    const parts: unknown[] = [];
    if (message.content) parts.push({ type: "text", text: message.content });
    if (context) parts.push({ type: "text", text: context });
    if (image) parts.push({ type: "image_url", image_url: { url: image } });

    return { role: message.role, content: parts };
  });
}

function send(res: ServerResponse, event: unknown): void {
  res.write(`${JSON.stringify(event)}\n`);
}

function cors(res: ServerResponse): void {
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-headers", "content-type");
  res.setHeader("access-control-allow-methods", "POST, OPTIONS");
}

/** 把内部工具表转成 OpenAI tools 格式 */
function openAiTools() {
  return Object.entries(CANVAS_TOOLS).map(([name, spec]) => ({
    type: "function" as const,
    function: {
      name,
      description: `${spec.description}（${spec.when}）`,
      parameters: { type: "object", additionalProperties: true },
    },
  }));
}

export async function handleChat(req: IncomingMessage, res: ServerResponse): Promise<void> {
  cors(res);

  if (req.method === "OPTIONS") {
    res.writeHead(204).end();
    return;
  }
  if (req.method !== "POST") {
    res.writeHead(405).end();
    return;
  }

  const { baseUrl, model, apiKey, session } = llmConfig();

  if (!apiKey) {
    res.writeHead(503, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        error: "LLM 未配置",
        hint: "在 apps/collab/.env 里设置 OPENAI_API_KEY（可配合 OPENAI_BASE_URL / LLM_MODEL 接任意 OpenAI 兼容后端）",
      }),
    );
    return;
  }

  let messages: ChatMessage[];
  let context: string | undefined;
  let image: string | undefined;
  try {
    ({ messages = [], context, image } = await readJson(req));
  } catch {
    res.writeHead(400).end(JSON.stringify({ error: "请求体不是合法 JSON" }));
    return;
  }

  res.writeHead(200, {
    "content-type": "application/x-ndjson; charset=utf-8",
    "cache-control": "no-store",
    "x-accel-buffering": "no",
  });

  let upstream: Response;
  try {
    upstream = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
        ...(session ? { "x-opencode-session": session } : {}),
      },
      body: JSON.stringify({
        model,
        stream: true,
        tools: openAiTools(),
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          ...buildOpenAiMessages(messages, context, image),
        ],
      }),
    });
  } catch (error) {
    send(res, { type: "error", message: `无法连接 LLM：${String(error)}` });
    send(res, { type: "done" });
    res.end();
    return;
  }

  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => "");
    send(res, { type: "error", message: `LLM 返回 ${upstream.status}：${detail.slice(0, 300)}` });
    send(res, { type: "done" });
    res.end();
    return;
  }

  // 累积流式的 tool_calls（OpenAI 会把 name/arguments 分片下发）
  const toolCalls = new Map<number, { name: string; args: string }>();
  const decoder = new TextDecoder();
  const reader = upstream.body.getReader();
  let buffer = "";

  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;

        let parsed: {
          choices?: Array<{
            delta?: {
              content?: string;
              tool_calls?: Array<{
                index: number;
                function?: { name?: string; arguments?: string };
              }>;
            };
          }>;
        };
        try {
          parsed = JSON.parse(payload);
        } catch {
          continue;
        }

        const delta = parsed.choices?.[0]?.delta;
        if (delta?.content) send(res, { type: "text", delta: delta.content });

        for (const call of delta?.tool_calls ?? []) {
          const entry = toolCalls.get(call.index) ?? { name: "", args: "" };
          if (call.function?.name) entry.name += call.function.name;
          if (call.function?.arguments) entry.args += call.function.arguments;
          toolCalls.set(call.index, entry);
        }
      }
    }

    for (const { name, args } of toolCalls.values()) {
      if (!name) continue;
      let parsedArgs: unknown = {};
      try {
        parsedArgs = args ? JSON.parse(args) : {};
      } catch {
        parsedArgs = {};
      }
      send(res, { type: "tool", name, arguments: parsedArgs });
    }

    send(res, { type: "done" });
  } catch (error) {
    send(res, { type: "error", message: `流式读取中断：${String(error)}` });
    send(res, { type: "done" });
  } finally {
    res.end();
  }
}

/** 供 onRequest 钩子路由 */
export function isChatRequest(req: IncomingMessage): boolean {
  return (req.url ?? "").split("?")[0] === "/api/chat";
}
