/**
 * 节点类型推断 + 默认节点尺寸
 *
 * ⚠️ 这里**曾经**是本地 planner（无 LLM 时把自然语言映射成画布工具调用）。
 * 产品改成「AI 是硬依赖」后，`plan()` / `freeSlot()` / `slotBeside()` 全链路删除
 * （见 git 历史）。这里只保留两个仍被复用的纯工具：
 *
 *   - `inferKind`        —— 按关键词把标题映射成 NodeKind（`chat/generate.ts` 用）
 *   - `DEFAULT_NODE_SIZE` —— 节点默认尺寸的唯一来源（`collab/seed.ts` 用）
 */
import type { NodeKind } from "@lingrui/knowledge";

const KIND_HINTS: Array<{ kind: NodeKind; words: string[] }> = [
  { kind: "cache", words: ["redis", "缓存", "memcached"] },
  { kind: "queue", words: ["kafka", "rabbit", "mq", "消息队列", "队列"] },
  { kind: "database", words: ["mysql", "postgres", "postgresql", "数据库", "db"] },
  { kind: "gateway", words: ["nginx", "kong", "gateway", "网关"] },
  { kind: "monitor", words: ["prometheus", "elk", "监控", "日志"] },
  { kind: "registry", words: ["nacos", "consul", "注册中心"] },
  { kind: "service", words: ["service", "微服务", "服务"] },
  { kind: "client", words: ["客户端", "浏览器", "用户"] },
];

export function inferKind(text: string): NodeKind {
  const lower = text.toLowerCase();
  for (const { kind, words } of KIND_HINTS) {
    if (words.some((w) => lower.includes(w))) return kind;
  }
  return "concept";
}

export const DEFAULT_NODE_SIZE = { width: 250, height: 96 };
