/**
 * System One（Jev）在 web 端的入口。
 *
 * 走 `/api/systemone` 代理（和 /api/chat 同一个服务端），带上登录 / 本地一次性 token。
 * 代理端才有 key —— 浏览器永远拿不到 apiKey。
 *
 * 所有能力都 **fail-open**：未启用、请求失败、超时 → 返回 null，
 * 调用方保留底层（Orama / BM25）顺序，绝不因为决策模型挂了就让功能变不可用。
 */
import { askSystemOne, rerankByNoul, type RankedByNoul } from "@lingrui/ai";
import { SYSTEMONE_API, systemOneEnabled } from "./config";
import { currentToken } from "../collab/token";

export { systemOneEnabled };

const bridge = typeof window === "undefined" ? undefined : window.lingrui;

function authHeaders(): Record<string, string> {
  const token = currentToken();
  return {
    ...(bridge?.token ? { "x-lingrui-token": bridge.token } : {}),
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  };
}

/**
 * 用 Jev 的 noul（校准过的「相关吗」概率）给一批候选**重排**。
 *
 * @param threshold 低于它的候选会被丢弃；默认 0.5（宁可一条不给，也别凑）。
 *                  传 0 = 只重排不过滤（用户主动搜索时更合适）。
 * @returns 排好序的候选；失败 / 未启用返回 null（调用方保留原顺序）。
 */
export async function jevRerank<T>(
  query: string,
  pool: readonly T[],
  excerptOf: (item: T) => string,
  options: { threshold?: number; signal?: AbortSignal } = {},
): Promise<Array<RankedByNoul<T>> | null> {
  if (!systemOneEnabled || pool.length === 0) return null;

  return rerankByNoul(
    query,
    pool,
    excerptOf,
    (state, questions, signal) =>
      askSystemOne(state, questions, {
        endpoint: SYSTEMONE_API,
        headers: authHeaders(),
        signal,
        timeoutMs: 8000,
      }),
    options,
  );
}
