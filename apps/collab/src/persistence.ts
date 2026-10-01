/**
 * Yjs 快照持久化（Postgres）。
 *
 * 表结构见下面的 DDL。真正上线前建议加：
 *   - 定时压缩（encodeStateAsUpdate 合并历史）
 *   - 文档级 ACL 表
 */
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

export const SCHEMA = `
create table if not exists yjs_documents (
  name       text primary key,
  state      bytea not null,
  updated_at timestamptz not null default now()
);
`;

export async function migrate(): Promise<void> {
  await pool.query(SCHEMA);
}

export async function fetchDocument(name: string): Promise<Uint8Array | null> {
  const { rows } = await pool.query<{ state: Buffer }>(
    "select state from yjs_documents where name = $1",
    [name],
  );
  const row = rows[0];
  return row ? new Uint8Array(row.state) : null;
}

export async function storeDocument(name: string, state: Uint8Array): Promise<void> {
  await pool.query(
    `insert into yjs_documents (name, state, updated_at)
     values ($1, $2, now())
     on conflict (name) do update set state = excluded.state, updated_at = now()`,
    [name, Buffer.from(state)],
  );
}

export async function closePool(): Promise<void> {
  await pool.end();
}
