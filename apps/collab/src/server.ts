/**
 * 独立部署入口（CLI）
 *
 *   bun run dev:collab   →  bun 构建 → node 运行
 *
 * 注意：必须用 Node 跑。Hocuspocus 4 内部依赖 crossws 的 Node 适配器，
 * 在 Bun 下会直接抛错（见 ADR-0010）。
 *
 * 桌面端不走这里，而是由 Electron 主进程内嵌 `startServer()`。
 */
import { startServer } from "./app";

const running = await startServer({
  port: Number(process.env.PORT ?? 1234),
});

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    void running.stop().then(() => process.exit(0));
  });
}
