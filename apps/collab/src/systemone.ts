/**
 * /api/systemone —— System One（TypeSafe / Jev）决策模型的代理
 *
 * 和 /api/chat 一样是**纯代理**：把 `{ state, questions }` 原样转发给 TypeSafe，
 * 把 `{ answers, model, usage }` 原样带回。**key 只在服务端**（env），浏览器永远拿不到。
 *
 * 为什么不直接从前端打 TypeSafe：那会把 apiKey 打进浏览器 bundle / 网络面板。
 *
 * 协议：POST { state, questions } → { model, answers, usage }
 * 未配置 key → 503，前端据此静默降级（不重排，保留底层顺序）。
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { verifyToken } from "./auth";

const DEFAULT_ENDPOINT = "https://api.typesafe.ai/v1/systemone";
const DEFAULT_MODEL = "jev-latest";

/**
 * 零配置复用本机已有的 Jev 配置（`~/.cc-agents/settings.json` 的 systemOne）。
 * env 优先；读不到就当作没配（fail-open）。
 */
function readLocalSystemOne(): { apiKey?: string; endpoint?: string; model?: string } {
  try {
    const raw = JSON.parse(readFileSync(join(homedir(), ".cc-agents", "settings.json"), "utf8")) as {
      systemOne?: { apiKey?: string; endpoint?: string; model?: string };
    };
    return raw.systemOne ?? {};
  } catch {
    return {};
  }
}

function config() {
  const local = readLocalSystemOne();
  return {
    endpoint: process.env.TYPESAFE_ENDPOINT || local.endpoint || DEFAULT_ENDPOINT,
    model: process.env.TYPESAFE_MODEL || local.model || DEFAULT_MODEL,
    apiKey: process.env.TYPESAFE_API_KEY || local.apiKey || "",
  };
}

/** 已配置 key 才能用；前端可据此提前跳过重排 */
export function systemOneConfigured(): boolean {
  return Boolean(config().apiKey);
}

export function isSystemOneRequest(req: IncomingMessage): boolean {
  return req.method === "POST" && (req.url ?? "").split("?")[0] === "/api/systemone";
}

async function readJson(req: IncomingMessage): Promise<{ state?: unknown; questions?: unknown }> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? (JSON.parse(raw) as { state?: unknown; questions?: unknown }) : {};
}

function cors(res: ServerResponse): void {
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-headers", "content-type, authorization, x-lingrui-token");
  res.setHeader("access-control-allow-methods", "POST, OPTIONS");
}

export interface SystemOneProxyOptions {
  /** 服务端开了账户体系时常开；桌面端内嵌（localToken）跳过 */
  requireAuth?: boolean;
}

export async function handleSystemOne(
  req: IncomingMessage,
  res: ServerResponse,
  options: SystemOneProxyOptions = {},
): Promise<void> {
  cors(res);

  if (req.method === "OPTIONS") {
    res.writeHead(204).end();
    return;
  }
  if (req.method !== "POST") {
    res.writeHead(405).end();
    return;
  }

  if (options.requireAuth) {
    const header = req.headers.authorization ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
    try {
      if (!token) throw new Error("missing token");
      await verifyToken(token);
    } catch {
      res.writeHead(401, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "需要登录" }));
      return;
    }
  }

  const { endpoint, model, apiKey } = config();
  if (!apiKey) {
    res.writeHead(503, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        error: "System One 未配置",
        hint: "在 apps/collab/.env 里设置 TYPESAFE_API_KEY（可选 TYPESAFE_ENDPOINT / TYPESAFE_MODEL）",
      }),
    );
    return;
  }

  let body: { state?: unknown; questions?: unknown };
  try {
    body = await readJson(req);
  } catch {
    res.writeHead(400).end(JSON.stringify({ error: "请求体不是合法 JSON" }));
    return;
  }
  if (!body.questions || typeof body.questions !== "object") {
    res.writeHead(400).end(JSON.stringify({ error: "缺少 questions" }));
    return;
  }

  let upstream: Response;
  try {
    upstream = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ state: body.state ?? "", model, questions: body.questions }),
    });
  } catch (error) {
    res.writeHead(502, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: `无法连接 System One：${String(error)}` }));
    return;
  }

  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => "");
    res.writeHead(upstream.status, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: `System One ${upstream.status}`, detail: detail.slice(0, 300) }));
    return;
  }

  const json = (await upstream.json()) as {
    model?: string;
    answers?: unknown;
    usage?: { input_tokens?: number; output_tokens?: number };
  };

  res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(
    JSON.stringify({
      model: json.model ?? model,
      answers: json.answers ?? {},
      usage: {
        input_tokens: json.usage?.input_tokens ?? 0,
        output_tokens: json.usage?.output_tokens ?? 0,
      },
    }),
  );
}
