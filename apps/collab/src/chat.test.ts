/**
 * /api/chat 的转码测试
 *
 * 用一个桩上游服务冒充 OpenAI（SSE 流），验证：
 *   1. 文本增量被转成 NDJSON 的 {type:"text",delta}
 *   2. 分片的 tool_calls 被拼装完整后以 {type:"tool"} 下发一次
 *   3. 未配置 key 时返回 503（客户端据此提示需要 AI 服务）
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { handleChat } from "./chat";

/** 冒充 OpenAI 的上游 */
function startStubUpstream(): Promise<{ server: Server; url: string }> {
  const server = createServer((req, res) => {
    if (!req.url?.endsWith("/chat/completions")) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { "content-type": "text/event-stream" });

    const frames = [
      { choices: [{ delta: { content: "请求" } }] },
      { choices: [{ delta: { content: "先到" } }] },
      // tool_calls 故意分片下发，模拟真实 OpenAI 行为
      { choices: [{ delta: { tool_calls: [{ index: 0, function: { name: "spawn" } }] } }] },
      { choices: [{ delta: { tool_calls: [{ index: 0, function: { name: "Node" } }] } }] },
      { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '{"id":"kafka"' } }] } }] },
      { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: ',"kind":"queue"}' } }] } }] },
      { choices: [{ delta: { content: "网关。" } }] },
    ];

    for (const frame of frames) res.write(`data: ${JSON.stringify(frame)}\n\n`);
    res.write("data: [DONE]\n\n");
    res.end();
  });

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, url: `http://127.0.0.1:${port}` });
    });
  });
}

/** 被测试的本地服务：只挂 /api/chat */
function startLocalApi(): Promise<{ server: Server; url: string }> {
  const server = createServer((req, res) => {
    void handleChat(req as IncomingMessage, res);
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, url: `http://127.0.0.1:${port}` });
    });
  });
}

async function readEvents(url: string, body: unknown): Promise<unknown[]> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

let upstream: { server: Server; url: string };
let local: { server: Server; url: string };

beforeAll(async () => {
  upstream = await startStubUpstream();
  process.env.OPENAI_API_KEY = "test-key";
  process.env.OPENAI_BASE_URL = `${upstream.url}/v1`;
  process.env.LLM_MODEL = "stub-model";
  local = await startLocalApi();
});

afterAll(() => {
  upstream.server.close();
  local.server.close();
  delete process.env.OPENAI_API_KEY;
});

describe("handleChat", () => {
  test("文本增量按序转成 NDJSON", async () => {
    const events = (await readEvents(`${local.url}/api/chat`, {
      messages: [{ role: "user", content: "hi" }],
    })) as Array<{ type: string; delta?: string }>;

    const texts = events.filter((e) => e.type === "text").map((e) => e.delta);
    expect(texts).toEqual(["请求", "先到", "网关。"]);
  });

  test("分片的 tool_calls 被拼装完整且只下发一次", async () => {
    const events = (await readEvents(`${local.url}/api/chat`, {
      messages: [{ role: "user", content: "hi" }],
    })) as Array<{ type: string; name?: string; arguments?: unknown }>;

    const tools = events.filter((e) => e.type === "tool");
    expect(tools).toHaveLength(1);
    expect(tools[0]?.name).toBe("spawnNode");
    expect(tools[0]?.arguments).toEqual({ id: "kafka", kind: "queue" });
  });

  test("最后一定以 done 结束", async () => {
    const events = (await readEvents(`${local.url}/api/chat`, {
      messages: [{ role: "user", content: "hi" }],
    })) as Array<{ type: string }>;
    expect(events.at(-1)?.type).toBe("done");
  });

  test("未配置 key 时返回 503，供客户端降级", async () => {
    const saved = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    const res = await fetch(`${local.url}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages: [] }),
    });
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: string; hint: string };
    expect(body.hint).toContain("OPENAI_API_KEY");
    process.env.OPENAI_API_KEY = saved;
  });

  test("非 POST 返回 405", async () => {
    const res = await fetch(`${local.url}/api/chat`, { method: "GET" });
    expect(res.status).toBe(405);
  });
});
