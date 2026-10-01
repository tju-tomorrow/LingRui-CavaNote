/**
 * 账户 HTTP 路由（/api/auth/*）
 *
 *   POST /api/auth/register  { email, password, name? } → { token, user }
 *   POST /api/auth/login     { email, password }         → { token, user }
 *   GET  /api/auth/me        Authorization: Bearer …     → { user }
 *
 * 签发的 JWT 与 Hocuspocus 用的是同一套 secret/issuer（见 auth.ts 的 verifyToken），
 * 所以登录后拿到的 token 既能连协同、也能调 /api/chat，前端只存一份。
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { signToken, verifyToken } from "./auth";
import type { User, UserStore } from "./users";

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "content-type, authorization",
    "access-control-allow-methods": "GET, POST, OPTIONS",
  });
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
}

function bearer(req: IncomingMessage): string {
  const header = req.headers.authorization ?? "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : "";
}

export function isAuthRequest(req: IncomingMessage): boolean {
  return (req.url ?? "").split("?")[0]?.startsWith("/api/auth/") ?? false;
}

export async function handleAuth(
  req: IncomingMessage,
  res: ServerResponse,
  users: UserStore,
): Promise<void> {
  if (req.method === "OPTIONS") {
    json(res, 204, null);
    return;
  }

  const path = (req.url ?? "").split("?")[0];

  try {
    if (path === "/api/auth/register" && req.method === "POST") {
      const body = await readJson(req);
      const email = String(body["email"] ?? "").trim();
      const password = String(body["password"] ?? "");
      const name = typeof body["name"] === "string" ? body["name"] : undefined;

      if (!email.includes("@")) return json(res, 400, { error: "邮箱格式不对" });
      if (password.length < 6) return json(res, 400, { error: "密码至少 6 位" });

      let user: User;
      try {
        user = await users.create({ email, password, name });
      } catch (error) {
        // 唯一索引冲突 = 邮箱已注册
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes("duplicate key")) {
          return json(res, 409, { error: "这个邮箱已经注册过了" });
        }
        throw error;
      }
      return json(res, 200, { token: await signToken(user), user });
    }

    if (path === "/api/auth/login" && req.method === "POST") {
      const body = await readJson(req);
      const email = String(body["email"] ?? "").trim();
      const password = String(body["password"] ?? "");
      const user = await users.verify(email, password);
      if (!user) return json(res, 401, { error: "邮箱或密码不对" });
      return json(res, 200, { token: await signToken(user), user });
    }

    if (path === "/api/auth/me" && req.method === "GET") {
      const token = bearer(req);
      if (!token) return json(res, 401, { error: "缺少 token" });
      const ctx = await verifyToken(token);
      const user = await users.byId(ctx.userId);
      if (!user) return json(res, 401, { error: "用户不存在" });
      return json(res, 200, { user });
    }

    json(res, 404, { error: "未知的账户接口" });
  } catch (error) {
    json(res, 500, { error: error instanceof Error ? error.message : String(error) });
  }
}
