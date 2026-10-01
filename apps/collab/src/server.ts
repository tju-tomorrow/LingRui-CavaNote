/**
 * LingRui Scribe — 协同服务
 *
 * 拓扑见 docs/adr/0006：
 *   Browser ──WS──► Hocuspocus ──► Postgres（Yjs 快照）
 *                        └──────► Redis（多实例广播）
 */
import { Server } from "@hocuspocus/server";
import { Database } from "@hocuspocus/extension-database";
import { Redis } from "@hocuspocus/extension-redis";
import { canAccess, verifyToken } from "./auth";
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

try {
  await migrate();
} catch (error) {
  console.error(
    [
      "[collab] 无法连接 Postgres。",
      "",
      "先启动本地依赖服务：",
      "  docker compose up -d",
      "",
      `DATABASE_URL=${process.env.DATABASE_URL ?? "(未设置)"}`,
      `原因：${error instanceof Error && error.message ? error.message : String(error)}`,
    ].join("\n"),
  );
  process.exit(1);
}

const server = new Server({
  port,

  async onAuthenticate({ token, documentName }) {
    if (!token) throw new Error("missing token");
    const ctx = await verifyToken(token);
    if (!canAccess(ctx, documentName)) throw new Error("forbidden");
    // 挂到 connection context，供后续 hook 使用
    return { userId: ctx.userId, userName: ctx.userName };
  },

  extensions: [
    new Database({
      fetch: ({ documentName }) => fetchDocument(documentName),
      store: ({ documentName, state }) => storeDocument(documentName, state),
    }),
    new Redis(redisConfig()),
  ],

  async onListen() {
    console.log(`[collab] listening on ws://localhost:${port}`);
  },
});

await server.listen();

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    void server.destroy().then(() => process.exit(0));
  });
}
