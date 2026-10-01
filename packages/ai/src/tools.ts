/**
 * @lingrui/ai — AI 编排层
 *
 * 两个方向：
 *   1. 解释：用户点节点 → 取 KnowledgeNode + 邻居 → 生成解释文本
 *   2. 演出：把解释编译成 SceneScript（见 @lingrui/anim）
 *
 * 这些 tool 定义同时服务于：
 *   - 前端 AI SDK 的 tool calling
 *   - 未来的 canvas MCP server（让外部 agent 也能画）
 */
import type { NodeKind, RelationKind } from "@lingrui/knowledge";

export interface SpawnNodeInput {
  id: string;
  kind: NodeKind;
  title: string;
  summary?: string;
  at: [number, number];
}

export interface ConnectInput {
  from: string;
  to: string;
  kind: RelationKind;
  label?: string;
}

/**
 * Tool 规格（与 Vercel AI SDK 的 tool() 形状对齐，这里只描述参数 schema）。
 * 真正注册时用 zod 生成 parameters。
 */
export const CANVAS_TOOLS = {
  spawnNode: {
    description: "在画布上生成一个基建实体节点，并写入 Knowledge 层",
    input: {} as SpawnNodeInput,
  },
  connect: {
    description: "在两个节点之间建立带语义的关系（calls/reads/writes/publishes…）",
    input: {} as ConnectInput,
  },
  flow: {
    description: "播放一段从 A 到 B 的数据流动画",
    input: {} as { from: string; to: string; label?: string; at: number },
  },
  focus: {
    description: "把镜头和吉祥物聚焦到某个节点",
    input: {} as { nodeId: string },
  },
  narrate: {
    description: "让吉祥物在某个时间点说一句话",
    input: {} as { at: number; text: string; nodeId?: string },
  },
} as const;

export type CanvasToolName = keyof typeof CANVAS_TOOLS;

export const SYSTEM_PROMPT = `你是 LingRui Scribe 的基建讲解 Agent。

规则：
1. 你的输出不是长文，而是**动作流**。把知识拆成「节点出现 → 建立关系 → 数据流动 → 吉祥物讲解」。
2. 每个节点必须先 spawnNode 再被引用；坐标由你规划，尽量分层（用户 → 网关 → 服务 → 存储）。
3. 一次讲解不超过 8 个节点，否则观众会迷失。
4. 讲解文本用口语短句，配合时间轴，一句不超过 30 字。
5. 不要编造知识；不确定的内容标注「不确定」并给出追问建议。`;

/** 节点类型 → 建议的默认标题，用于 AI 缺省时兜底 */
export const KIND_DEFAULT_TITLE: Record<NodeKind, string> = {
  client: "用户",
  gateway: "API 网关",
  service: "后端服务",
  cache: "Redis 缓存",
  database: "数据库",
  queue: "消息队列",
  registry: "注册中心",
  monitor: "监控日志",
  concept: "概念",
  note: "笔记",
};
