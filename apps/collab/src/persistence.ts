/**
 * 持久化层工厂
 *
 * 之所以做成工厂而不是模块级单例：桌面端（Electron 主进程）要内嵌这个服务，
 * 连接串来自运行时配置而不是模块加载时的 env。
 */
import { getPool } from "./db";

export interface Persistence {
  migrate(): Promise<void>;
  fetchDocument(name: string): Promise<Uint8Array | null>;
  storeDocument(name: string, state: Uint8Array): Promise<void>;
  close(): Promise<void>;
}

const SCHEMA = `
create table if not exists yjs_documents (
  name       text primary key,
  state      bytea not null,
  updated_at timestamptz not null default now()
);
`;

export function createPersistence(connectionString: string): Persistence {
  const pool = getPool(connectionString);

  return {
    async migrate() {
      await pool.query(SCHEMA);
    },

    async fetchDocument(name) {
      const { rows } = await pool.query<{ state: Buffer }>(
        "select state from yjs_documents where name = $1",
        [name],
      );
      const row = rows[0];
      return row ? new Uint8Array(row.state) : null;
    },

    async storeDocument(name, state) {
      await pool.query(
        `insert into yjs_documents (name, state, updated_at)
         values ($1, $2, now())
         on conflict (name) do update set state = excluded.state, updated_at = now()`,
        [name, Buffer.from(state)],
      );
    },

    async close() {
      // 池是共享的，由 closePools() 统一关闭
    },
  };
}
