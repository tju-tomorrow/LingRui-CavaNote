/**
 * @lingrui/ai — AI 编排层
 *
 * 两个方向：
 *   1. 解释：用户点节点 → 取 KnowledgeNode + 邻居 → 生成解释文本
 *   2. 演出：把解释编译成 SceneScript（见 @lingrui/anim）
 *
 * 工具定义同时服务于：
 *   - 前端 AI SDK 的 tool calling
 *   - 本地 planner（无 LLM 时的降级路径）
 *   - 未来的 canvas MCP server
 *
 * 实际执行在 executor.ts —— 那里是唯一能改 Y.Doc 的地方。
 */
import type { NodeKind } from "@lingrui/knowledge";
import type { CanvasToolCall } from "./executor";

/** 工具描述表：给 LLM 看的能力清单 */
export const CANVAS_TOOLS = {
  spawnNode: {
    description: "在画布上生成一个基建实体节点，并写入 Knowledge 层",
    when: "当讲解需要引入新实体时",
  },
  connect: {
    description: "在两个节点之间建立带语义的关系（calls/reads/writes/publishes…）",
    when: "当要说明谁调用谁、谁读写谁时",
  },
  flow: {
    description: "播放一段从 A 到 B 的数据流动画",
    when: "当要演示一次请求/一条消息的走向时",
  },
  focus: {
    description: "把镜头和吉祥物聚焦到某个节点",
    when: "当要强调某个实体时",
  },
  narrate: {
    description: "让吉祥物在某个时间点说一句话",
    when: "当需要旁白时",
  },
} as const;

export type CanvasToolName = keyof typeof CANVAS_TOOLS;

export const TOOL_NAMES = Object.keys(CANVAS_TOOLS) as CanvasToolName[];

/** 把 LLM 返回的 tool 调用转成内部可执行的形状（含最小校验） */
export function toCanvasToolCall(
  name: string,
  input: unknown,
): CanvasToolCall | { error: string } {
  if (!TOOL_NAMES.includes(name as CanvasToolName)) {
    return { error: `未知工具：${name}` };
  }
  if (typeof input !== "object" || input === null) {
    return { error: `${name} 的入参必须是对象` };
  }
  return { name: name as CanvasToolName, input } as CanvasToolCall;
}

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
