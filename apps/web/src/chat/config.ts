/**
 * AI / 协同后端的地址解析。
 *
 * 单独一个模块，避免 `auth/store` 与 `chat/remote` 互相 import 形成循环：
 * `auth/store` 需要 `CHAT_API` 来拼 `/api/auth`，而 `remote` 需要 token 来发请求。
 * 把「地址」抽出来，两边都只依赖它，循环即消失。
 */

/** 桌面端桥（preload 注入）；web 版不存在 */
const bridge = typeof window === "undefined" ? undefined : window.lingrui;

/**
 * 后端目标解析顺序：
 *   1. 桌面端内嵌服务（随机端口 + 一次性 token，Key 只在主进程）
 *   2. web 版：Vite 代理的 /api/chat
 *   3. 显式设 "off" = AI 不可用（本应用不降级，会直接报错）
 */
export const CHAT_API: string =
  bridge?.chatApi ?? (import.meta.env.VITE_CHAT_API as string | undefined) ?? "/api/chat";

export const remoteEnabled = CHAT_API !== "off";

/**
 * System One（TypeSafe / Jev）决策模型的地址。
 *
 * 默认与 /api/chat **同一个服务端**（只是换个路径）—— 桌面端内嵌服务、
 * web 版 Vite 代理都自动适用，不用额外配置。key 只在服务端。
 * 显式设 VITE_SYSTEMONE_API=off 可强制关闭（检索不做重排）。
 */
export const SYSTEMONE_API: string =
  (import.meta.env.VITE_SYSTEMONE_API as string | undefined) ??
  (CHAT_API === "off" ? "off" : CHAT_API.replace(/\/chat\/?$/, "/systemone"));

export const systemOneEnabled = SYSTEMONE_API !== "off";
