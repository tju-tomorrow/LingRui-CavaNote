#!/usr/bin/env node
/**
 * 本地开发用的 JWT —— 让 web 端能连上协同服务（Hocuspocus 要求 token）。
 *
 *   node scripts/dev-token.mjs
 *   node scripts/dev-token.mjs 30        # 有效期天数，默认 30
 *
 * secret / issuer 与 apps/collab/.env 对齐；documents="*" 表示可访问全部文档。
 * 生产环境当然不能这么干（要有真正的登录与签发流程）。
 *
 * 用 node:crypto 手写 HS256 而不是引 jose：脚本放在仓库根，
 * 而 jose 只装在 apps/collab，从根目录 import 不到（会直接报找不到包）。
 * HS256 的 JWT 就是三段 base64url + HMAC，没必要为它引依赖。
 */
import { createHmac } from "node:crypto";

const secret = process.env.JWT_SECRET ?? "dev-only-change-me";
const issuer = process.env.JWT_ISSUER ?? "lingrui";
const days = Number(process.argv[2] ?? 30);

const b64 = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
const now = Math.floor(Date.now() / 1000);

const header = b64({ alg: "HS256", typ: "JWT" });
const payload = b64({
  name: "本机开发",
  documents: "*",
  sub: "local",
  iss: issuer,
  iat: now,
  exp: now + Math.round(days * 86400),
});
const signature = createHmac("sha256", secret).update(`${header}.${payload}`).digest("base64url");

process.stdout.write(`${header}.${payload}.${signature}\n`);
