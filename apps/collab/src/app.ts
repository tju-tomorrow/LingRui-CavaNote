/**
 * 协同服务 + LLM 代理（可嵌入）
 *
 * 两个入口共用这一份实现：
 *   - CLI：apps/collab/src/server.ts（独立部署）
 *   - 桌面端：apps/desktop 主进程内嵌（Electron 主进程就是 Node，Hocuspocus 可直接跑）
 *
 * 拓扑见 docs/adr/0006：
 *   Browser ──WS──► Hocuspocus ──► Postgres（Yjs 快照，可选）
 *                        └──────► Redis（多实例广播，可选）
 *
 * 依赖全部可选：没有 Postgres 只是不落库，没有 Redis 只是不能多实例。
 */
import { Server, type Extension } from "@hocuspocus/server";
import { Database } from "@hocuspocus/extension-database";
import { Redis } from "@hocuspocus/extension-redis";
import type { IncomingMessage, ServerResponse } from "node:http";
import { canAccess, verifyToken } from "./auth";
import { handleChat, isChatRequest } from "./chat";
import { createPersistence, type Persistence } from "./persistence";

export interface StartServerOptions {
  /** 0 = 让系统分配随机端口（桌面端用这个） */
  port?: number;
  host?: string;
  databaseUrl?: string;
  redisUrl?: string;
  /** 多实例部署才需要 */
  redisEnabled?: boolean;
  /** 本地内嵌时的一次性 token；设置后 WS 与 /api/chat 都要求带上 */
  localToken?: string;
  quiet?: boolean;
}

export interface RunningServer {
  port: number;
  /** 供 renderer 用的 HTTP 基址 */
  httpUrl: string;
  /** 供 renderer 用的 WebSocket 基址 */
  wsUrl: string;
  persistenceReady: boolean;
  stop(): Promise<void>;
}

export async function startServer(options: StartServerOptions = {}): Promise<RunningServer> {
  const {
    port = 1234,
    host,
    databaseUrl = process.env.DATABASE_URL,
    redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379",
    redisEnabled = process.env.COLLAB_REDIS === "1",
    localToken,
    quiet = false,
  } = options;

  const log = (...args: unknown[]) => {
    if (!quiet) console.log(...args);
  };
  const warn = (...args: unknown[]) => {
    if (!quiet) console.warn(...args);
  };

  // ---- Postgres：失败不致命 ----
  let persistence: Persistence | null = null;
  if (databaseUrl) {
    const candidate = createPersistence(databaseUrl);
    try {
      await candidate.migrate();
      persistence = candidate;
    } catch (error) {
      await candidate.close().catch(() => undefined);
      warn(
        [
          "[collab] 连不上 Postgres，本次不做 Yjs 持久化。",
          "  启动依赖：docker compose up -d",
          `  原因：${error instanceof Error && error.message ? error.message : String(error)}`,
        ].join("\n"),
      );
    }
  }

  const extensions: Extension[] = [];
  if (persistence) {
    const p = persistence;
    extensions.push(
      new Database({
        fetch: ({ documentName }) => p.fetchDocument(documentName),
        store: ({ documentName, state }) => p.storeDocument(documentName, state),
      }),
    );
  }
  if (redisEnabled) {
    const url = new URL(redisUrl);
    extensions.push(
      new Redis({
        host: url.hostname,
        port: Number(url.port || 6379),
        options: url.password ? { password: decodeURIComponent(url.password) } : undefined,
      }),
    );
  }

  const server = new Server({
    port,
    ...(host ? { address: host } : {}),

    async onAuthenticate({ token, documentName }) {
      // 桌面端内嵌：只认一次性 token
      if (localToken) {
        if (token !== localToken) throw new Error("bad local token");
        return { userId: "local", userName: "本机" };
      }
      if (!token) throw new Error("missing token");
      const ctx = await verifyToken(token);
      if (!canAccess(ctx, documentName)) throw new Error("forbidden");
      return { userId: ctx.userId, userName: ctx.userName };
    },

    extensions,
  });

  // Hocuspocus 的 requestHandler 在 onRequest hook 之后会**无条件**再写一次
  // `200 Welcome to Hocuspocus!`，没有 writableEnded 检查。我们自己处理 /api/chat 时
  // 就会撞上 ERR_HTTP_HEADERS_SENT。这里直接接管 HTTP 路由：
  //   /api/chat → 我们处理，其余交回 Hocuspocus。
  const httpServer = server.httpServer;
  const hocuspocusHandler = httpServer.listeners("request")[0] as
    | ((req: IncomingMessage, res: ServerResponse) => void)
    | undefined;
  httpServer.removeAllListeners("request");
  httpServer.on("request", (req: IncomingMessage, res: ServerResponse) => {
    if (!isChatRequest(req)) {
      hocuspocusHandler?.(req, res);
      return;
    }
    if (localToken && req.headers["x-lingrui-token"] !== localToken) {
      res.writeHead(403, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "bad local token" }));
      return;
    }
    void handleChat(req, res);
  });

  await server.listen();

  const address = server.address;
  const actualPort = typeof address === "object" && address ? address.port : port;
  const displayHost = host ?? "127.0.0.1";

  log(`[collab] ws://${displayHost}:${actualPort}  (persistence: ${persistence ? "postgres" : "off"})`);
  log(
    process.env.OPENAI_API_KEY
      ? `[collab] /api/chat 已就绪（${process.env.LLM_MODEL ?? "gpt-4o-mini"} @ ${process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1"}）`
      : "[collab] /api/chat 未配置 LLM，客户端会自动降级到本地 planner",
  );

  return {
    port: actualPort,
    httpUrl: `http://${displayHost}:${actualPort}`,
    wsUrl: `ws://${displayHost}:${actualPort}`,
    persistenceReady: persistence !== null,
    async stop() {
      await server.destroy();
      await persistence?.close().catch(() => undefined);
    },
  };
}
