/**
 * LingRui Scribe — 协同服务 + LLM 代理
 *
 * 拓扑见 docs/adr/0006：
 *   Browser ──WS──► Hocuspocus ──► Postgres（Yjs 快照）
 *                        └──────► Redis（多实例广播，可选）
 *
 * 同一个端口还提供 HTTP API：
 *   POST /api/chat  →  代理任意 OpenAI 兼容后端（见 chat.ts）
 *
 * 依赖是可选的：没有 Postgres 也能启动（只是文档不落库），
 * 没有 Redis 也能启动（只是不能多实例）。这样 /api/chat 在任何环境都能用。
 */
import { Server } from "@hocuspocus/server";
import { Database } from "@hocuspocus/extension-database";
import type { Extension } from "@hocuspocus/server";
import { Redis } from "@hocuspocus/extension-redis";
import { canAccess, verifyToken } from "./auth";
import { handleChat, isChatRequest } from "./chat";
import { fetchDocument, migrate, storeDocument } from "./persistence";

const port = Number(process.env.PORT ?? 1234);

/** 把 REDIS_URL 拆成扩展需要的 host / port / options */
function redisConfig(): { host: string; port: number; options?: { password?: string } } {
  const url = new URL(process.env.REDIS_URL ?? "redis://localhost:6379");
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    options: url.password ? { password: decodeURIComponent(url.password) } : undefined,
  };
}

// ---- Postgres：失败不致命，只是没有持久化 ----
let dbReady = false;
try {
  await migrate();
  dbReady = true;
} catch (error) {
  console.warn(
    [
      "[collab] 连不上 Postgres，本次不做 Yjs 持久化。",
      "  启动依赖：docker compose up -d",
      `  DATABASE_URL=${process.env.DATABASE_URL ?? "(未设置)"}`,
      `  原因：${error instanceof Error && error.message ? error.message : String(error)}`,
    ].join("\n"),
  );
}

const extensions: Extension[] = [];

if (dbReady) {
  extensions.push(
    new Database({
      fetch: ({ documentName }) => fetchDocument(documentName),
      store: ({ documentName, state }) => storeDocument(documentName, state),
    }),
  );
}

// ---- Redis：只有多实例部署才需要，显式开启 ----
if (process.env.COLLAB_REDIS === "1") {
  extensions.push(new Redis(redisConfig()));
}

const server = new Server({
  port,

  async onAuthenticate({ token, documentName }) {
    if (!token) throw new Error("missing token");
    const ctx = await verifyToken(token);
    if (!canAccess(ctx, documentName)) throw new Error("forbidden");
    return { userId: ctx.userId, userName: ctx.userName };
  },

  extensions,

  async onListen() {
    console.log(`[collab] ws://localhost:${port}  (persistence: ${dbReady ? "postgres" : "off"})`);
    console.log(
      process.env.OPENAI_API_KEY
        ? `[collab] /api/chat 已就绪（${process.env.LLM_MODEL ?? "gpt-4o-mini"} @ ${process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1"}）`
        : "[collab] /api/chat 未配置 LLM，客户端会自动降级到本地 planner",
    );
  },

  async onRequest({ request, response }) {
    if (isChatRequest(request)) {
      await handleChat(request, response);
    }
  },
});

await server.listen();

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    void server.destroy().then(() => process.exit(0));
  });
}
