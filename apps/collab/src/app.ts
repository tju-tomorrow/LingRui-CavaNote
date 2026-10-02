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
import { handleAuth, isAuthRequest } from "./auth-routes";
import { handleChat, isChatRequest } from "./chat";
import { handleSystemOne, isSystemOneRequest, systemOneConfigured } from "./systemone";
import { closePools } from "./db";
import { loadLlmEnv } from "./llm-env";
import { createPersistence, type Persistence } from "./persistence";
import { createUserStore, migrateUsers, type UserStore } from "./users";

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

  // 零配置 LLM：没有 OPENAI_API_KEY 时从 ~/.config / opencode auth 探测（桌面端已提前设过则跳过）
  const llmSource = loadLlmEnv();
  if (llmSource && llmSource !== "env") log(`[collab] LLM 配置：${llmSource}`);

  // ---- Postgres：失败不致命 ----
  let persistence: Persistence | null = null;
  // 账户体系（可选）：有数据库才有 /api/auth/*；没有也能跑，只是不能登录
  let users: UserStore | null = null;
  if (databaseUrl) {
    const candidate = createPersistence(databaseUrl);
    try {
      await candidate.migrate();
      persistence = candidate;
      await migrateUsers(databaseUrl);
      users = createUserStore(databaseUrl);
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
    // 账户接口（没数据库时明确告知不可用，而不是落到 Hocuspocus 的欢迎页）
    if (isAuthRequest(req)) {
      if (!users) {
        res.writeHead(503, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "服务端没连数据库，账户体系不可用" }));
        return;
      }
      void handleAuth(req, res, users);
      return;
    }

    // System One（Jev）决策模型代理：只回带概率的标签，和 /api/chat 互不干扰
    if (isSystemOneRequest(req)) {
      if (localToken && req.headers["x-lingrui-token"] !== localToken) {
        res.writeHead(403, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "bad local token" }));
        return;
      }
      void handleSystemOne(req, res, { requireAuth: Boolean(users) && !localToken });
      return;
    }

    if (!isChatRequest(req)) {
      hocuspocusHandler?.(req, res);
      return;
    }
    if (localToken && req.headers["x-lingrui-token"] !== localToken) {
      res.writeHead(403, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "bad local token" }));
      return;
    }
    // 开了账户体系就要求登录；桌面端内嵌（localToken）已在上一步校验过
    void handleChat(req, res, { requireAuth: Boolean(users) && !localToken });
  });

  await server.listen();

  const address = server.address;
  const actualPort = typeof address === "object" && address ? address.port : port;
  const displayHost = host ?? "127.0.0.1";

  log(
    `[collab] ws://${displayHost}:${actualPort}  (persistence: ${persistence ? "postgres" : "off"}${users ? ", accounts: on" : ""})`,
  );
  log(
    process.env.OPENAI_API_KEY
      ? `[collab] /api/chat 已就绪（${process.env.LLM_MODEL ?? "gpt-4o-mini"} @ ${process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1"}）`
      : "[collab] /api/chat 未配置 LLM，客户端会提示需要 AI 服务",
  );
  log(
    systemOneConfigured()
      ? `[collab] /api/systemone 已就绪（${process.env.TYPESAFE_MODEL ?? "jev-latest"}）`
      : "[collab] /api/systemone 未配置 key，检索将不做 Jev 重排",
  );

  return {
    port: actualPort,
    httpUrl: `http://${displayHost}:${actualPort}`,
    wsUrl: `ws://${displayHost}:${actualPort}`,
    persistenceReady: persistence !== null,
    async stop() {
      await server.destroy();
      await persistence?.close().catch(() => undefined);
      await users?.close().catch(() => undefined);
      // 连接池是共享的，最后统一关
      await closePools();
    },
  };
}
