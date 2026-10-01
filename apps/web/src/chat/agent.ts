/**
 * 聊天 Agent —— 把用户的自然语言变成"改画布 + 回话"
 *
 * 两条路径：
 *   1. 有 LLM：/api/chat 返回文本增量 + tool 调用 → runToolCall 落到 Y.Doc
 *   2. 无 LLM：本地 planner（packages/ai/src/planner.ts）产出同样的 tool 调用
 *
 * 两条路径共用同一个 executor，所以"AI 自己画节点"的能力不依赖模型是否存在。
 */
import {
  executePetTool,
  executeTool,
  plan,
  planPet,
  toCanvasToolCall,
  toPetToolCall,
  type PetToolCall,
  type ToolResult,
} from "@lingrui/ai";
import {
  getNodes,
  listChapters,
  listPets,
  readNode,
  replaceChapters,
  upsertNode,
} from "@lingrui/knowledge";
import { deriveShots, type Action } from "@lingrui/anim";
import { ydoc } from "../collab/doc";
import { layoutSnapshot } from "../collab/layout";
import { NODE_SIZE } from "../collab/seed";
import { upsertNodeCard } from "../editor/bridge";
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

/** 上一次写进 Y.Doc 的分镜指纹（内存态，刷新即清） */
let lastSeededShotsFp = "";

/**
 * 从当前动作流推导分镜（缩略图用），并同步进 Y.Doc（PRD/演出层.md §4）。
 *
 * 同步规则（「先推导、后人工改」）：
 *   - Y.Doc 里的分镜**和上一版推导一致** → 用新的推导覆盖（AI 每轮都在讲新节点，
 *     分镜应该跟着长）；
 *   - 一旦**人工**改过（重命名/合并/排序，指纹就不再等于推导）→ 推导停手，
 *     以人工那版为准。
 */
function shotsOf() {
  const nodes = getNodes(ydoc);
  const derived = deriveShots(timeline, (id) => nodes.get(id)?.title);

  if (derived.length > 0) {
    const persistedFp = listChapters(ydoc)
      .map((c) => c.id)
      .join(",");
    if (persistedFp === lastSeededShotsFp && lastSeededShotsFp !== "") {
      // 推导与落盘一致且已落过盘 → 跟随推导继续长
      replaceChapters(
        ydoc,
        derived.map((s, i) => ({ id: s.id, title: s.title, order: i, startT: s.startT })),
      );
    } else if (listChapters(ydoc).length === 0 && lastSeededShotsFp === "") {
      // 第一次落盘：分镜还完全没有，种一份（这是"未人工改过"的初始态）
      replaceChapters(
        ydoc,
        derived.map((s, i) => ({ id: s.id, title: s.title, order: i, startT: s.startT })),
      );
    }
  }
  lastSeededShotsFp = derived.map((s) => s.id).join(",");
  return derived;
}

/** 执行一次宠物工具调用 */
function runPetTool(call: PetToolCall): string {
  const result = executePetTool(ydoc, call);
  return result.ok ? `\n\n🐾 ${result.message}` : `\n\n（${result.message}）`;
}

/**
 * AI 写文档（PRD/主界面.md §5.3）：以 nodeId 为键**幂等** upsert 正文块，
 * 并把块 id 双绑回 node.blockIds。
 *
 * 幂等为什么天然成立：知识卡片只存 nodeId，标题/摘要实时从 Y.Doc 读，
 * 所以「已存在」就是「已是最新」，不会追加、不会重复写。
 *
 * 已知不一致：我们的 UndoManager 只管 nodes/order/layout/annotations，
 * 不管 BlockNote 的文档 fragment（它有自己一套 history，纳进来会双重撤销）。
 * 所以撤销一轮 AI 改动后，卡片块会留下（显示为「未知节点」）。
 */
function syncNodeToDocument(nodeId: string): void {
  const blockId = upsertNodeCard(nodeId);
  if (!blockId) return;

  const node = readNode(ydoc, nodeId);
  if (!node) return;

  const blockIds = node.blockIds ?? (node.blockId ? [node.blockId] : []);
  if (blockIds.includes(blockId)) return; // 已经绑过，幂等退出

  upsertNode(ydoc, { ...node, blockIds: [...blockIds, blockId] });
}

/** 执行一次画布工具调用，返回给用户看的短句 */
export function runToolCall(name: string, input: unknown): string {
  // 宠物工具优先（两个工具名空间不重叠）
  const pet = toPetToolCall(name, input);
  if (!("error" in pet)) return runPetTool(pet);

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
    if (call.name === "spawnNode" || call.name === "updateNode") syncNodeToDocument(call.input.id);
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
  // 宠物意图优先："养一只蓝色的猫老师"
  const petPlan = planPet(message, { hasPets: listPets(ydoc).length > 0 });
  if (petPlan.calls.length > 0) {
    const notes: string[] = [];
    for (const call of petPlan.calls) {
      const result = executePetTool(ydoc, call);
      if (!result.ok) notes.push(`\n\n（${result.message}）`);
    }
    return { reply: petPlan.reply + notes.join(""), toolResults: [] };
  }

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
    // 供"移到 X 旁边"计算空位用
    positions: layout,
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
      // 节点类写入 → 同步到文档并双绑 blockIds（幂等）
      if (call.name === "spawnNode" || call.name === "updateNode") syncNodeToDocument(call.input.id);
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
