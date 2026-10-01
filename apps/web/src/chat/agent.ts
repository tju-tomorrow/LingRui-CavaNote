/**
 * 聊天 Agent —— 把用户的自然语言变成"改画布 + 回话"
 *
 * 两条路径：
 *   1. 有 LLM：/api/chat 返回文本增量 + tool 调用 → runToolCall 落到 Y.Doc
 *   2. 无 LLM：本地 planner（packages/ai/src/planner.ts）产出同样的 tool 调用
 *
 * 两条路径共用同一个 executor，所以"AI 自己画节点"的能力不依赖模型是否存在。
 */
import { executeTool, plan, toCanvasToolCall, type ToolResult } from "@lingrui/ai";
import { getNodes } from "@lingrui/knowledge";
import type { Action } from "@lingrui/anim";
import { ydoc } from "../collab/doc";
import { layoutSnapshot } from "../collab/layout";
import { getFocus, setFocus } from "../state/focus";
import { buildReply } from "./explain";

/** 时间轴游标：每次交互往后推进，动作流因此天然有序（P2 的时间轴会消费它） */
let cursor = 0;
const timeline: Action[] = [];

function applyToolResult(result: ToolResult): string {
  timeline.push(...result.actions);
  cursor += 1.5;
  return result.ok ? `\n\n⚙ ${result.message}` : `\n\n（${result.message}）`;
}

/** 执行一次画布工具调用，返回给用户看的短句 */
export function runToolCall(name: string, input: unknown): string {
  const call = toCanvasToolCall(name, input);
  if ("error" in call) return `\n\n（工具调用被忽略：${call.error}）`;

  const result = executeTool({ doc: ydoc, t: cursor }, call);
  if (result.ok) {
    if (call.name === "focus") setFocus(call.input.nodeId);
    if (call.name === "spawnNode") setFocus(call.input.id);
  }
  return applyToolResult(result);
}

export interface AgentTurn {
  reply: string;
  toolResults: ToolResult[];
}

/** 本地路径：planner → executor → 回话 */
export function runAgent(message: string): AgentTurn {
  const nodes = [...getNodes(ydoc).values()];
  const occupied = Object.values(layoutSnapshot());

  const p = plan(message, { t: cursor, nodes, occupied });
  const toolResults: ToolResult[] = [];

  for (const call of p.calls) {
    const result = executeTool({ doc: ydoc, t: cursor }, call);
    toolResults.push(result);
    timeline.push(...result.actions);
    cursor += 1.5;

    if (result.ok) {
      if (call.name === "focus") setFocus(call.input.nodeId);
      if (call.name === "spawnNode") setFocus(call.input.id);
    }
  }
  cursor += 2;

  const reply = p.reply || buildReply(message, getFocus());
  return { reply, toolResults };
}

/** P2 的时间轴会从这里取动作流 */
export function exportedTimeline(): Action[] {
  return [...timeline];
}
