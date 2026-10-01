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
import { deriveShots, type Action } from "@lingrui/anim";
import { ydoc } from "../collab/doc";
import { layoutSnapshot } from "../collab/layout";
import { NODE_SIZE } from "../collab/seed";
import { getFocus, setFocus } from "../state/focus";
import { beginRound } from "../state/history";
import { pushPending } from "../state/pending";
import { player } from "../state/player";
import { buildReply } from "./explain";

/** 时间轴游标：每次交互往后推进，动作流因此天然有序（P2 的时间轴会消费它） */
let cursor = 0;
/** 上一轮 AI 生成的节点，用于"把它连到 X" */
let lastSpawnedId: string | undefined;
const timeline: Action[] = [];

function applyToolResult(result: ToolResult): string {
  timeline.push(...result.actions);
  cursor += 1.5;

  // 三级保险第二级：破坏人的元素时不直接应用，挂起等用户确认
  if (!result.applied && result.pending) {
    pushPending(result.pending.call, result.pending.reason, result.risk);
    return `\n\n⏸ ${result.message}`;
  }
  return result.ok ? `\n\n⚙ ${result.message}` : `\n\n（${result.message}）`;
}

/** 从当前动作流推导分镜（缩略图用） */
function shotsOf() {
  const nodes = getNodes(ydoc);
  return deriveShots(timeline, (id) => nodes.get(id)?.title);
}

/** 执行一次画布工具调用，返回给用户看的短句 */
export function runToolCall(name: string, input: unknown): string {
  const call = toCanvasToolCall(name, input);
  if ("error" in call) return `\n\n（工具调用被忽略：${call.error}）`;

  const startT = cursor;
  beginRound();
  const result = executeTool({ doc: ydoc, t: cursor }, call);
  if (result.ok) {
    if (call.name === "focus") setFocus(call.input.nodeId);
    if (call.name === "spawnNode") {
      setFocus(call.input.id);
      lastSpawnedId = call.input.id;
    }
  }
  const message = applyToolResult(result);
  // 本轮从 startT 起自动播放（让宠物真地演一遍）
  if (result.ok) player.load(exportedTimeline(), "AI 演出", startT, shotsOf());
  return message;
}

export interface AgentTurn {
  reply: string;
  toolResults: ToolResult[];
}

/** 本地路径：planner → executor → 回话 */
export function runAgent(message: string): AgentTurn {
  const nodes = [...getNodes(ydoc).values()];
  const layout = layoutSnapshot();
  // 传矩形而不是点：否则新节点算不出真正的空位（会压在已有节点上）
  const occupied = nodes.map((n) => {
    const at = layout[n.id] ?? { x: 0, y: 0 };
    return { x: at.x, y: at.y, width: NODE_SIZE.width, height: NODE_SIZE.height };
  });

  const p = plan(message, {
    t: cursor,
    nodes,
    occupied,
    lastSpawnedId,
    nodeSize: NODE_SIZE,
  });
  const toolResults: ToolResult[] = [];
  const startT = cursor;
  const notes: string[] = [];

  // 这一轮的写入归为一个 undo 批次
  beginRound();

  for (const call of p.calls) {
    const result = executeTool({ doc: ydoc, t: cursor }, call);
    toolResults.push(result);
    // 复用 applyToolResult：内含时间轴累加 + 游标推进 + pending 挂起
    notes.push(applyToolResult(result));

    if (result.ok) {
      if (call.name === "focus") setFocus(call.input.nodeId);
      if (call.name === "spawnNode") {
        setFocus(call.input.id);
        lastSpawnedId = call.input.id;
      }
    }
  }
  cursor += 2;

  // 本轮产生了动作 → 装载时间轴并从本轮起点自动播放
  if (toolResults.some((r) => r.ok)) player.load(exportedTimeline(), "AI 演出", startT, shotsOf());

  // 把工具做了什么（含"需要你确认"）回显给用户
  const reply = (p.reply || buildReply(message, getFocus())) + notes.join("");
  return { reply, toolResults };
}

/** P2 的时间轴会从这里取动作流 */
export function exportedTimeline(): Action[] {
  return [...timeline];
}
