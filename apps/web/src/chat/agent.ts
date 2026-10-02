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
  type CanvasToolCall,
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
import type * as Y from "yjs";
import { deriveShots, type Action } from "@lingrui/anim";
import { ROOT_TIMELINE } from "@lingrui/knowledge";
import { ydoc } from "../collab/doc";
import { layoutSnapshot } from "../collab/layout";
import { NODE_SIZE } from "../collab/seed";
import { upsertNodeCard } from "../editor/bridge";
import { getFocus, setFocus } from "../state/focus";
import { beginRound } from "../state/history";
import { pushPending } from "../state/pending";
import { pushRoundChange, startRoundChanges } from "../state/round";
import { autoSnapshot, autoSnapshotThrottled } from "../shell/snapshot";
import { player } from "../state/player";
import { buildReply } from "./explain";

/** 时间轴游标：每次交互往后推进，动作流因此天然有序（P2 的时间轴会消费它） */
let cursor = 0;
/** 上一轮 AI 生成的节点，用于"把它连到 X" */
let lastSpawnedId: string | undefined;
const timeline: Action[] = [];

function applyToolResult(result: ToolResult): string {
  pushActions(result.actions);
  cursor += 1.5;

  // 三级保险第二级：破坏人的元素时不直接应用，挂起等用户确认
  if (!result.applied && result.pending) {
    pushPending(result.pending.call, result.pending.reason, result.risk);
    return `\n\n⏸ ${result.message}`;
  }
  return result.ok ? `\n\n⚙ ${result.message}` : `\n\n（${result.message}）`;
}

/**
 * 从当前动作流推导分镜（缩略图用），并同步进 Y.Doc（PRD/演出层.md §4）。
 *
 * 规则：**只要没有人工改过（`source === "manual"`），就跟着推导走**。
 * 早先靠内存里的「上次推导指纹」判断，刷新后指纹丢了 → 既不覆盖也不播种 →
 * 分镜永久停在旧数据上（演出已经往前走了，缩略图还是老的）。
 */
function shotsOf() {
  const nodes = getNodes(ydoc);
  const derived = deriveShots(timeline, (id) => nodes.get(id)?.title);
  if (derived.length === 0) return derived;

  const persisted = listChapters(ydoc);
  const edited = persisted.some((c) => c.source === "manual");
  if (!edited) {
    replaceChapters(
      ydoc,
      derived.map((s, i) => ({
        id: s.id,
        title: s.title,
        order: i,
        startT: s.startT,
        source: "auto" as const,
      })),
    );
  }
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

/** 工具调用 → 改动清单里的一行（PRD/主界面.md §5.1） */
function describeChange(call: CanvasToolCall, ok: boolean, pending: boolean): string {
  const input = call.input as unknown as Record<string, unknown>;
  const title = typeof input.title === "string" ? input.title : "";
  const id = typeof input.id === "string" ? input.id : "";
  const label = title || id;
  switch (call.name) {
    case "spawnNode":
      return `新增节点「${label}」`;
    case "updateNode":
      return `更新节点「${label}」`;
    case "moveNode":
      return `移动节点「${label}」`;
    case "deleteNode":
      return `删除节点「${label}」`;
    case "connect":
      return `连线 ${String(input.from)} → ${String(input.to)}`;
    case "disconnect":
      return `断开 ${String(input.from)} → ${String(input.to)}`;
    case "setStyle":
      return `改样式「${label}」`;
    case "annotate":
      return "添加标注";
    case "updateAnnotation":
      return "修改标注";
    case "deleteAnnotation":
      return "删除标注";
    case "focus":
      return `聚焦「${String(input.nodeId ?? "")}」`;
    case "narrate":
      return "旁白";
    case "flow":
      return "数据流动画";
    default:
      // 联合类型已被穷尽，这里只在将来新增工具时兜底
      return ok ? "改动" : `改动（未生效${pending ? "，待确认" : ""}）`;
  }
}

/** 这条改动能定位到哪个节点 */
function targetNodeOf(call: CanvasToolCall): string | undefined {
  const input = call.input as unknown as Record<string, unknown>;
  if (typeof input.id === "string") return input.id;
  if (typeof input.nodeId === "string") return input.nodeId;
  if (typeof input.from === "string") return input.from;
  return undefined;
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
  // 动手前自动打点（同一轮内节流成一个点）—— 这样「回到 AI 改之前」永远可用
  autoSnapshotThrottled(`AI：${call.name}`);
  const result = executeTool({ doc: ydoc, t: cursor }, call);
  if (result.ok) {
    if (call.name === "focus") setFocus(call.input.nodeId);
    if (call.name === "spawnNode") {
      setFocus(call.input.id);
      lastSpawnedId = call.input.id;
    }
    if (call.name === "spawnNode" || call.name === "updateNode") syncNodeToDocument(call.input.id);
  }
  pushRoundChange({
    tool: call.name,
    label: describeChange(call, result.ok, Boolean(result.pending)),
    nodeId: targetNodeOf(call),
    pending: !result.applied && Boolean(result.pending),
  });

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

  // 这一轮的写入归为一个 undo 批次；清单也重新开始记
  beginRound();
  startRoundChanges();
  // 动手前自动打点：这样「回到 AI 改之前」是可用的（不是只有手动保存才有退路）
  if (p.calls.length > 0) autoSnapshot(`AI：${message.slice(0, 12)}`);

  for (const call of p.calls) {
    const result = executeTool({ doc: ydoc, t: cursor }, call);
    toolResults.push(result);
    // 复用 applyToolResult：内含时间轴累加 + 游标推进 + pending 挂起
    notes.push(applyToolResult(result));
    pushRoundChange({
      tool: call.name,
      label: describeChange(call, result.ok, Boolean(result.pending)),
      nodeId: targetNodeOf(call),
      pending: !result.applied && Boolean(result.pending),
    });

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

// ---------------------------------------------------------------------------
// 演出的持久化
// ---------------------------------------------------------------------------

/**
 * 动作流同时写进 Y.Doc。
 *
 * 之前只在内存里：刷新一下演出就没了（chapters 和缩略图都还在，唯独演不了）——
 * 「数据在、界面没有」是最让人困惑的一种状态。
 */
function pushActions(actions: Action[]): void {
  if (actions.length === 0) return;
  timeline.push(...actions);
  timelineArray().push(actions);
}

function timelineArray(): Y.Array<Action> {
  return ydoc.getArray<Action>(ROOT_TIMELINE);
}

/**
 * 从 Y.Doc 恢复演出（应用启动时调一次）。
 *
 * 同时把内存游标推到末尾：新的一轮接着老的动作流继续排，不会时间倒流。
 */
export function hydrateTimeline(): boolean {
  const stored = timelineArray().toArray();
  if (stored.length === 0) return false;

  timeline.length = 0;
  timeline.push(...stored);

  const last = stored.reduce((max, a) => Math.max(max, a.t), 0);
  cursor = last + 1.5;

  // 顺带把分镜重新推导一遍：恢复的演出可能比 Y.Doc 里的 chapters 新
  player.load(exportedTimeline(), "AI 演出", last, shotsOf());
  return true;
}

/** 清空演出（设置里的「重来」用得上） */
export function clearTimeline(): void {
  timeline.length = 0;
  cursor = 0;
  const array = timelineArray();
  if (array.length > 0) array.delete(0, array.length);
  player.clear();
}
