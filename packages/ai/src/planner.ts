/**
 * 本地 planner —— 没有 LLM 时，把自然语言映射成 Canvas 工具调用
 *
 * 它不"理解"语言，只做模式匹配；但它**调用的是和真实 LLM 完全相同的那套工具**
 * （packages/ai/src/executor.ts）。所以接入 LLM 时，只需要把这里换成模型输出，
 * 下游一行都不用改。
 */
import type { KnowledgeNode, NodeKind } from "@lingrui/knowledge";
import type { CanvasToolCall } from "./executor";

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

/** "添加 X" / "加一个 X" / "再画一个 X" */
const ADD_PATTERN = /(?:添加|加上|新增|加一个|再加一个|画一个|补一个|add)\s*[:：]?\s*(.+)/i;

export interface PlanContext {
  t: number;
  nodes: KnowledgeNode[];
  /** 画布上已占用的位置 */
  occupied: Array<{ x: number; y: number }>;
}

export interface Plan {
  calls: CanvasToolCall[];
  /** 给用户的回话（为空则由调用方走默认讲解） */
  reply: string;
}

export function inferKind(text: string): NodeKind {
  const lower = text.toLowerCase();
  for (const { kind, words } of KIND_HINTS) {
    if (words.some((w) => lower.includes(w))) return kind;
  }
  return "concept";
}

/** 在已有节点右侧找一个空位，保证新节点不会盖住旧的 */
export function freeSlot(occupied: Array<{ x: number; y: number }>): [number, number] {
  if (occupied.length === 0) return [0, 0];
  const maxX = Math.max(...occupied.map((p) => p.x));
  return [maxX + 320, 0];
}

const KIND_TITLE: Partial<Record<NodeKind, string>> = {
  cache: "缓存",
  queue: "消息队列",
  database: "数据库",
  gateway: "网关",
  monitor: "监控",
  registry: "注册中心",
  service: "服务",
  client: "客户端",
  concept: "概念",
};

export function plan(message: string, ctx: PlanContext): Plan {
  const text = message.trim();
  if (!text) return { calls: [], reply: "" };

  // 1) "添加 X" → spawnNode
  const addMatch = ADD_PATTERN.exec(text);
  if (addMatch?.[1]) {
    const raw = addMatch[1]
      .trim()
      .replace(/[。！!？?，,]$/, "")
      // 去掉口语量词："添加一个 Kafka" → "Kafka"
      .replace(/^(?:一个|一条|一台|一组|个|些)\s*/, "")
      .trim();
    if (raw) {
      const kind = inferKind(raw);
      const title = raw.length > 1 ? raw : (KIND_TITLE[kind] ?? "新节点");
      const id = `n-${slug(title)}-${ctx.nodes.length + 1}`;
      const at = freeSlot(ctx.occupied);
      return {
        calls: [{ name: "spawnNode", input: { id, kind, title, at } }],
        reply: `已在画布上生成节点「${title}」（类型：${kind}）。\n它现在还没有连到链路上——你可以说"把它连到后端服务"。`,
      };
    }
  }

  // 2) 命中已有节点 → focus + 旁白
  const hit = ctx.nodes.find((n) => text.includes(n.title) || text.includes(n.id));
  if (hit) {
    return {
      calls: [
        { name: "focus", input: { nodeId: hit.id } },
        { name: "narrate", input: { text: `带你去看 ${hit.title}`, nodeId: hit.id } },
      ],
      reply: "",
    };
  }

  // 3) 只有关键词命中类型
  const kind = inferKind(text);
  if (kind !== "concept") {
    const existing = ctx.nodes.find((n) => n.kind === kind);
    // 链路上已经有这类实体 → 聚焦它
    if (existing) {
      return {
        calls: [
          { name: "focus", input: { nodeId: existing.id } },
          { name: "narrate", input: { text: `带你去看 ${existing.title}`, nodeId: existing.id } },
        ],
        reply: "",
      };
    }
    // 还没有 → 补上并聚焦
    const title = KIND_TITLE[kind] ?? "新节点";
    const id = `n-${slug(title)}-${ctx.nodes.length + 1}`;
    return {
      calls: [
        { name: "spawnNode", input: { id, kind, title, at: freeSlot(ctx.occupied) } },
        { name: "focus", input: { nodeId: id } },
      ],
      reply: `这条链路上还没有「${title}」，我已经把它加到画布上了。`,
    };
  }

  return { calls: [], reply: "" };
}

function slug(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 24) || "node"
  );
}
