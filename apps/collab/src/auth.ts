/**
 * 鉴权：校验 Hocuspocus 连接携带的 JWT。
 * 一个 room = 一个文档 id，token 里带该用户可访问的文档集合。
 */
import { jwtVerify, type JWTPayload } from "jose";

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

export type { JWTPayload };
