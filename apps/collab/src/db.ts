/**
 * 共享的 Postgres 连接池。
 *
 * 之前 `persistence.ts` 和 `users.ts` 各建一个 `pg.Pool` —— 同一个进程里
 * 两套连接池，白白多占连接。这里按连接串缓存，谁要谁取。
 */
import pg from "pg";

const pools = new Map<string, pg.Pool>();

export function getPool(connectionString: string): pg.Pool {
  const existing = pools.get(connectionString);
  if (existing) return existing;
  const pool = new pg.Pool({ connectionString });
  pools.set(connectionString, pool);
  return pool;
}

/** 进程退出前统一关掉 */
export async function closePools(): Promise<void> {
  await Promise.all([...pools.values()].map((pool) => pool.end().catch(() => undefined)));
  pools.clear();
}
