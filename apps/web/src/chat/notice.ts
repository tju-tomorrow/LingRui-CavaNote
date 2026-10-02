/**
 * 远端 AI 不可用时，给用户看的**可见原因**。
 *
 * 为什么单独放一个纯函数模块：它只做「status → 人话」的映射，没有 React / DOM 依赖，
 * 可以直接单元测试。
 *
 * 注意：本应用**不降级到本地讲解器**（AI 是硬依赖）——连不上就如实报错并给出修复指引，
 * 绝不假装还能回答。
 */
import { ChatApiError } from "./remote";

export function remoteFailureNotice(error: unknown): string {
  if (error instanceof ChatApiError) {
    if (error.status === 401) {
      return "⚠️ AI 需要登录后才能用：点右上角「登录 / 注册」，或让服务端发一个本地 token（scripts/dev-token.mjs）。";
    }
    if (error.status === 403) {
      return "⚠️ AI 连接被拒绝（token 不匹配）。检查 VITE_COLLAB_TOKEN / 桌面端一次性 token 是否与服务端一致。";
    }
    if (error.status === 503) {
      return "⚠️ AI 服务没配置 LLM（缺 OPENAI_API_KEY）。在 apps/collab/.env 里配置后重启 collab server。";
    }
    return `⚠️ AI 服务返回 ${error.status}。请检查 collab server 日志。`;
  }
  return "⚠️ 连不上 AI 服务（网络或服务未启动）。`bun run dev` 会自动拉起 collab server；若单独跑，用 `bun run dev:collab` 并确认 VITE_CHAT_API 指向它。";
}
