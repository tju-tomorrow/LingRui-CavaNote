/**
 * 鉴权：校验 Hocuspocus 连接携带的 JWT。
 * 一个 room = 一个文档 id，token 里带该用户可访问的文档集合。
 */
import { jwtVerify, SignJWT, type JWTPayload } from "jose";

export interface AuthContext {
  userId: string;
  userName: string;
  /** 允许访问的文档 id；"*" 表示全部 */
  documents: string[] | "*";
}

const encoder = new TextEncoder();

export async function verifyToken(token: string): Promise<AuthContext> {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set");

  const { payload } = await jwtVerify(token, encoder.encode(secret), {
    issuer: process.env.JWT_ISSUER ?? "lingrui",
  });

  return {
    userId: String(payload.sub),
    userName: String(payload["name"] ?? "anonymous"),
    documents: (payload["documents"] as string[] | "*") ?? [],
  };
}

export function canAccess(ctx: AuthContext, documentName: string): boolean {
  return ctx.documents === "*" || ctx.documents.includes(documentName);
}

/**
 * 签发登录 token。
 *
 * 与 `verifyToken` 共用同一套 secret / issuer，所以登录拿到的 token
 * 既能连协同（WebSocket）、也能调 /api/chat，前端只需要存一份。
 */
export async function signToken(
  user: { id: string; name: string },
  options: { documents?: string[] | "*"; days?: number } = {},
): Promise<string> {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set");
  const days = options.days ?? 30;

  return await new SignJWT({ name: user.name, documents: options.documents ?? "*" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuer(process.env.JWT_ISSUER ?? "lingrui")
    .setIssuedAt()
    .setExpirationTime(`${days}d`)
    .sign(new TextEncoder().encode(secret));
}

export type { JWTPayload };
