/**
 * 用户存储（账户体系，PRD/导出与分发.md §5 的前置）
 *
 * 只依赖 Postgres + `node:crypto`：
 *   - 口令用 **scrypt**（不是 bcrypt/argon2：不引新依赖，scrypt 本身够用）
 *   - 每个用户独立 salt，存成 `scrypt$<salt>$<hash>`，校验用 timingSafeEqual
 *
 * 没有数据库时整个账户体系不可用（服务端会跳过 /api/auth/*），
 * 但应用本身仍能跑 —— 这是有意的：不登录也要能打开（本地优先）。
 */
import { randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { getPool } from "./db";

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

const KEYLEN = 64;

const SCHEMA = `
create table if not exists users (
  id            text primary key,
  email         text unique not null,
  name          text not null,
  password_hash text not null,
  created_at    timestamptz not null default now()
);
`;

export interface User {
  id: string;
  email: string;
  name: string;
}

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scryptAsync(password, salt, KEYLEN);
  return `scrypt$${salt.toString("base64")}$${derived.toString("base64")}`;
}

async function checkPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltB64, hashB64] = stored.split("$");
  if (scheme !== "scrypt" || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, "base64");
  const derived = await scryptAsync(password, Buffer.from(saltB64, "base64"), expected.length);
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

export interface UserStore {
  create(input: { email: string; password: string; name?: string }): Promise<User>;
  verify(email: string, password: string): Promise<User | null>;
  byId(id: string): Promise<User | null>;
  close(): Promise<void>;
}

export function createUserStore(connectionString: string): UserStore {
  const pool = getPool(connectionString);

  return {
    async create({ email, password, name }) {
      const id = randomUUID();
      const displayName = name?.trim() || email.split("@")[0] || "用户";
      const hash = await hashPassword(password);
      await pool.query(
        "insert into users (id, email, name, password_hash) values ($1, $2, $3, $4)",
        [id, email.toLowerCase(), displayName, hash],
      );
      return { id, email: email.toLowerCase(), name: displayName };
    },

    async verify(email, password) {
      const { rows } = await pool.query<{
        id: string;
        email: string;
        name: string;
        password_hash: string;
      }>("select id, email, name, password_hash from users where email = $1", [
        email.toLowerCase(),
      ]);
      const row = rows[0];
      if (!row) return null;
      if (!(await checkPassword(password, row.password_hash))) return null;
      return { id: row.id, email: row.email, name: row.name };
    },

    async byId(id) {
      const { rows } = await pool.query<User>(
        "select id, email, name from users where id = $1",
        [id],
      );
      return rows[0] ?? null;
    },

    async close() {
      // 池是共享的，由 closePools() 统一关闭
    },
  };
}

/** 建表（和 persistence.migrate 一起在启动时跑）——注意**不要**关池，它是共享的 */
export async function migrateUsers(connectionString: string): Promise<void> {
  await getPool(connectionString).query(SCHEMA);
}
