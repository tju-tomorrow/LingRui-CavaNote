/**
 * 聊天 Agent —— 把模型的工具调用落到 Y.Doc
 *
 * AI 是硬依赖：`/api/chat` 返回 NDJSON（文本增量 + tool 调用），
 * 统一走 `runToolCall` 写画布 / 笔记。
 * 本地 planner（`runAgent` / `chat/explain.ts`）已删除 —— 见 git 历史。
 */
import {
  executePetTool,
  executeTool,
  toCanvasToolCall,
  toPetToolCall,
  type CanvasToolCall,
  type PetToolCall,
  type ToolResult,
} from "@lingrui/ai";
import {
  addNodesToCanvas,
  createCanvas,
  getNodes,
  listChapters,
  readNode,
  replaceChapters,
  replaceCanvasChapters,
  upsertNode,
} from "@lingrui/knowledge";
import * as Y from "yjs";
import { deriveShots, type Action } from "@lingrui/anim";
import { ROOT_TIMELINE, ROOT_TIMELINES } from "@lingrui/knowledge";
import { ydoc } from "../collab/doc";
import {
  appendNoteParagraph,
  insertCanvasEmbed,
  insertKnowledgeCard,
  upsertNodeCard,
} from "../editor/bridge";
import { setFocus } from "../state/focus";
import { getActiveCanvas, setActiveCanvas } from "../state/canvas";
import { getActiveNote } from "../state/notes";
import { beginRound } from "../state/history";
import { pushPending } from "../state/pending";
import { pushRoundChange } from "../state/round";
import { autoSnapshotThrottled } from "../shell/snapshot";
import { player } from "../state/player";

/** 时间轴游标：每次交互往后推进，动作流因此天然有序（P2 的时间轴会消费它） */
let cursor = 0;
const timeline: Action[] = [];

/** 把新节点挂到当前概念画布（打开了某张画布时才做） */
function attachToActiveCanvas(nodeId: string, at: readonly [number, number]): void {
  const canvasId = getActiveCanvas();
  if (!canvasId) return;
  addNodesToCanvas(ydoc, canvasId, [nodeId], { [nodeId]: { x: at[0], y: at[1] } });
}

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

  const persisted = listChapters(ydoc, getActiveCanvas() ?? undefined);
  const edited = persisted.some((c) => c.source === "manual");
  if (!edited) {
    const chapters = derived.map((s, i) => ({
      id: s.id,
      title: s.title,
      order: i,
      startT: s.startT,
      source: "auto" as const,
    }));
    const canvasId = getActiveCanvas();
    // 画布是完整资产：分镜按画布隔离，切画布不会串场
    if (canvasId) replaceCanvasChapters(ydoc, canvasId, chapters);
    else replaceChapters(ydoc, chapters);
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
/**
 * LingRui Script（`direct` 工具）：把有序节拍展开成逐个工具调用。
 * 每一拍先执行 `do`，再按需执行一次 `narrate` 把 `say` 说出来。
 */
function runDirect(input: unknown): string {
  const beats = (input as { beats?: unknown } | null)?.beats;
  if (!Array.isArray(beats) || beats.length === 0) {
    return "\n\n（direct 需要非空 beats 数组）";
  }
  let out = "";
  for (const raw of beats) {
    if (!raw || typeof raw !== "object") continue;
    const beat = raw as Record<string, unknown>;
    const tool = beat["do"];
    if (typeof tool !== "string" || tool === "direct") continue;

    const args: Record<string, unknown> = { ...beat };
    delete args["do"];
    delete args["say"];
    out += runToolCall(tool, args);

    const say = beat["say"];
    if (typeof say === "string" && say.trim()) {
      const nodeId =
        typeof args["nodeId"] === "string"
          ? args["nodeId"]
          : typeof args["id"] === "string"
            ? args["id"]
            : undefined;
      out += runToolCall("narrate", { text: say, ...(nodeId ? { nodeId } : {}) });
    }
  }
  return out;
}

export function runToolCall(name: string, input: unknown): string {
  // LingRui Script：一次给出整段有序节拍
  if (name === "direct") return runDirect(input);

  // 写笔记（扩展笔记，而不是改画布）
  if (name === "writeNote") {
    const args = (input ?? {}) as { text?: unknown; nodeId?: unknown };
    const nodeId = typeof args.nodeId === "string" ? args.nodeId : "";
    if (nodeId) {
      const ok = insertKnowledgeCard(nodeId);
      return ok ? `\n\n📝 已把「${nodeId}」写入笔记` : "\n\n（该节点已在笔记里，或编辑器未就绪）";
    }
    const text = typeof args.text === "string" ? args.text : "";
    const ok = appendNoteParagraph(text);
    return ok ? "\n\n📝 已写入笔记" : "\n\n（编辑器未就绪或内容为空，未写入笔记）";
  }

  // 新建一张概念画布，并嵌进当前笔记
  if (name === "newCanvas") {
    const args = (input ?? {}) as { title?: unknown; noteId?: unknown };
    const title =
      typeof args.title === "string" && args.title.trim() ? args.title.trim() : "新概念画布";
    const noteId = typeof args.noteId === "string" ? args.noteId : (getActiveNote() ?? undefined);
    const canvas = createCanvas(ydoc, title, noteId);
    setActiveCanvas(canvas.id);
    const embedded = insertCanvasEmbed(canvas.id);
    return `\n\n🗂 已新建概念画布「${title}」${embedded ? "，并嵌入笔记" : ""}`;
  }

  // 宠物工具优先（两个工具名空间不重叠）
  const pet = toPetToolCall(name, input);
  if (!("error" in pet)) return runPetTool(pet);

  const call = toCanvasToolCall(name, input);
  if ("error" in call) return `\n\n（工具调用被忽略：${call.error}）`;

  const startT = cursor;
  beginRound();
  // 动手前自动打点（同一轮内节流成一个点）—— 这样「回到 AI 改之前」永远可用
  autoSnapshotThrottled(`AI：${call.name}`);
  const result = executeTool(
    { doc: ydoc, t: cursor, canvasId: getActiveCanvas() ?? undefined },
    call,
  );
  if (result.ok) {
    if (call.name === "focus") setFocus(call.input.nodeId);
    if (call.name === "spawnNode") {
      setFocus(call.input.id);
      attachToActiveCanvas(call.input.id, call.input.at);
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
  timelineArrayFor(getActiveCanvas()).push(actions);
}

/** 没有 active canvas 时的桶（旧全局数据也迁到这里） */
const GLOBAL_TIMELINE_KEY = "__global__";

function timelineKey(canvasId: string | null): string {
  return canvasId ?? GLOBAL_TIMELINE_KEY;
}

function timelinesMap(): Y.Map<Y.Array<Action>> {
  return ydoc.getMap<Y.Array<Action>>(ROOT_TIMELINES);
}

/** 读取某张画布已存的演出（不创建） */
function storedTimeline(canvasId: string | null): Y.Array<Action> | undefined {
  return timelinesMap().get(timelineKey(canvasId));
}

/** 写入用：拿到（必要时创建）某张画布的演出数组 */
function timelineArrayFor(canvasId: string | null): Y.Array<Action> {
  const map = timelinesMap();
  const key = timelineKey(canvasId);
  let array = map.get(key);
  if (!array) {
    array = new Y.Array<Action>();
    map.set(key, array);
  }
  return array;
}

/** 旧数据迁移：把 ROOT_TIMELINE 那个全局数组搬进 __global__ 桶（只做一次） */
function migrateLegacyTimeline(): void {
  const map = timelinesMap();
  if (map.size > 0) return;
  const legacy = ydoc.getArray<Action>(ROOT_TIMELINE);
  if (legacy.length === 0) return;
  timelineArrayFor(null).push(legacy.toArray());
}

/**
 * 把某张画布的演出装进内存 + 播放器（切画布 / 启动时调）。
 *
 * 画布是完整资产：切画布 = 换一套演出，不会串场。
 * 同时把内存游标推到末尾，新的一轮接着老的动作流继续排，不会时间倒流。
 */
export function hydrateTimeline(canvasId: string | null = getActiveCanvas()): boolean {
  migrateLegacyTimeline();
  const stored = storedTimeline(canvasId)?.toArray() ?? [];

  timeline.length = 0;
  timeline.push(...stored);

  if (stored.length === 0) {
    cursor = 0;
    player.clear();
    return false;
  }

  const last = stored.reduce((max, a) => Math.max(max, a.t), 0);
  cursor = last + 1.5;

  // 顺带把分镜重新推导一遍：恢复的演出可能比 Y.Doc 里的 chapters 新
  player.load(exportedTimeline(), "AI 演出", last, shotsOf());
  return true;
}

/** 清空当前画布的演出 */
export function clearTimeline(): void {
  timeline.length = 0;
  cursor = 0;
  const array = storedTimeline(getActiveCanvas());
  if (array && array.length > 0) array.delete(0, array.length);
  player.clear();
}
