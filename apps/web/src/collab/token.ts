/**
 * 协同（WebSocket）与 AI（/api/chat）共用的 token 解析。
 *
 * 为什么必须共用一份：
 *   早先 WebSocket 用「登录 token ?? 开发回退 token」，而 /api/chat 只用登录 token。
 *   于是没登录时会出现**半接上**：画布协同正常，AI 却 401，
 *   看起来像「Agent 根本没接上」。
 *
 * 规则：
 *   1. 已登录 → 登录 token（同一个 token 既连协同也调 AI）
 *   2. 否则   → 回退 token：web 版用 VITE_COLLAB_TOKEN（scripts/dev-token.mjs 铸的），
 *               桌面端用 bridge.token（内嵌服务的一次性 token）
 */
import { authToken } from "../auth/store";

const bridge = typeof window === "undefined" ? undefined : window.lingrui;

/** 未登录时的回退 token（web：开发用 JWT；桌面端：内嵌服务一次性 token） */
export const fallbackToken: string | undefined =
  bridge?.token ?? (import.meta.env.VITE_COLLAB_TOKEN as string | undefined);

/**
 * token 在**调用时**才取：登录 / 登出后要能立刻生效，
 * 而不是冻结在模块初始化那一刻。
 */
export function currentToken(): string | null {
  return authToken() ?? fallbackToken ?? null;
}
