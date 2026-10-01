/**
 * 本地 planner —— 没有 LLM 时，把自然语言映射成 Canvas 工具调用
 *
 * 它不"理解"语言，只做模式匹配；但它**调用的是和真实 LLM 完全相同的那套工具**
 * （packages/ai/src/executor.ts）。所以接入 LLM 时，只需要把这里换成模型输出，
 * 下游一行都不用改。
 */
import type { KnowledgeNode, NodeKind } from "@lingrui/knowledge";
import type { CanvasToolCall, UpdateNodeInput } from "./executor";

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

/** "连到 Y" / "接到 Y" */
const CONNECT_PATTERN = /(?:连到|连接到|接到|接入到|指向|connect\s*to)\s*[:：]?\s*(.+)/i;
// 切分用：把前面的连词（并/和/与/，）一起吃掉，否则会残留在标题里
const CONNECT_SPLIT = /(?:并|和|与|，|,|、)?\s*(?:连到|连接到|接到|接入到|指向|connect\s*to)/i;

/** "删掉 X" / "去掉 X" */
const DELETE_PATTERN = /(?:删掉|删除|去掉|移除|delete|remove)\s*[:：]?\s*(.+)/i;
/** "把 X 去掉" / "将 X 删除"（动词在后） */
const DELETE_PATTERN_SUFFIX = /(?:把|将)\s*(.+?)\s*(?:删掉|删除|去掉|移除)/i;

/** "把 X 改名为 Y" / "把 X 改成 Y" / "将 X 重命名为 Y" */
const RENAME_PATTERN =
  /(?:把|将)\s*(.+?)\s*(?:改名为|重命名为|改叫|改成|改为)\s*[:：]?\s*(.+)$/;
/** "给 X 加上摘要 Y" */
const SUMMARY_GIVE_PATTERN = /(?:给|为)\s*(.+?)\s*(?:加上|添加|加个)\s*摘要\s*[:：]?\s*(.+)$/;
/** "把 X 的摘要改成 Y" */
const SUMMARY_OF_PATTERN = /(?:把|将)\s*(.+?)\s*的摘要\s*(?:改成|改为|是)\s*[:：]?\s*(.+)$/;
/** "把 X 移到 Y 上面" / "把 X 挪到 Y 旁边" / "把 X 放到 Y 左边" */
const MOVE_PATTERN = /(?:把|将)\s*(.+?)\s*(?:移到|移动到|挪到|拖到|放到)\s*(.+)$/;
/** "把 X 连到 Y"（指定起点的连线；不带"把 X"的短句走 lastSpawned 分支） */
const CONNECT_SUBJECT_PATTERN = /(?:把|将)\s*(.+?)\s*(?:连到|连接到|接到|接入到)\s*(.+)$/;

/** 把方向词从目的地文本里剥掉（"Redis 上面" → "Redis"），再去匹配节点 */
const DIRECTION_WORDS =
  /(?:的)?(?:左边|左侧|左面|右边|右侧|右面|上面|上边|上方|上侧|下面|下边|下方|下侧|旁边|附近|前面|后面|中心|中间)\s*/g;

type Direction = "left" | "right" | "up" | "down";
const DIRECTION_HINTS: Array<[RegExp, Direction]> = [
  [/左边|左侧|左面/, "left"],
  [/右边|右侧|右面/, "right"],
  [/上面|上边|上方|上侧/, "up"],
  [/下面|下边|下方|下侧/, "down"],
];
const DIRECTION_NAME: Record<Direction, string> = {
  left: "左边",
  right: "右边",
  up: "上面",
  down: "下面",
};

/** 口语量词前缀 */
const QUANTIFIER = /^(?:一个|一条|一台|一组|个|些)\s*/;

export const DEFAULT_NODE_SIZE = { width: 250, height: 96 };

export interface SlotRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const overlaps = (a: SlotRect, b: SlotRect): boolean =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/**
 * 找一个不会与现有节点重叠的空位。
 *
 * 早先的实现只用 x 坐标（`max(x) + 320`）、忽略节点宽度，调用方传的还是"点"而不是"矩形"，
 * 结果新节点会压在已有节点上。这里按矩形算，并从内容右侧向右逐列找。
 */
export function freeSlot(
  occupied: SlotRect[],
  size: { width: number; height: number } = DEFAULT_NODE_SIZE,
  gap = 70,
): [number, number] {
  if (occupied.length === 0) return [0, 0];

  const right = Math.max(...occupied.map((r) => r.x + r.width));
  const top = Math.min(...occupied.map((r) => r.y));
  const bottom = Math.max(...occupied.map((r) => r.y + r.height));
  // 纵向与现有图谱居中对齐，看起来不像被随手丢在角落
  const centerY = Math.round((top + bottom) / 2 - size.height / 2);

  const stepX = size.width + gap;
  const stepY = size.height + gap;

  for (let col = 0; col < 32; col += 1) {
    const x = right + gap + col * stepX;
    for (let row = 0; row < 32; row += 1) {
      const y = centerY + row * stepY;
      const candidate = { x, y, width: size.width, height: size.height };
      if (!occupied.some((r) => overlaps(r, candidate))) return [x, y];
    }
  }

  return [right + gap, centerY];
}

/**
 * 在锚点节点某个方向的旁边找一个空位（沿该方向逐格向外找，直到与所有人都错开）。
 *
 * otherRects 应该**排除被移动的那个节点自己**（它马上要离开当前位置），
 * 否则必然和自己的旧位置重叠、永远找不着空位。
 */
export function slotBeside(
  positions: Record<string, { x: number; y: number }>,
  otherRects: SlotRect[],
  anchorId: string,
  dir: Direction,
  size: { width: number; height: number } = DEFAULT_NODE_SIZE,
  gap = 40,
): [number, number] {
  const anchor = positions[anchorId] ?? { x: 0, y: 0 };
  const base =
    dir === "right"
      ? { x: anchor.x + size.width + gap, y: anchor.y }
      : dir === "left"
        ? { x: anchor.x - size.width - gap, y: anchor.y }
        : dir === "up"
          ? { x: anchor.x, y: anchor.y - size.height - gap }
          : { x: anchor.x, y: anchor.y + size.height + gap };

  const alongX = dir === "left" || dir === "right";
  const sign = dir === "left" || dir === "up" ? -1 : 1;
  const step = alongX ? size.width + gap : size.height + gap;

  for (let i = 0; i < 24; i += 1) {
    const at = {
      x: base.x + (alongX ? i * sign * step : 0),
      y: base.y + (alongX ? 0 : i * sign * step),
    };
    const rect = { ...at, width: size.width, height: size.height };
    if (!otherRects.some((r) => overlaps(r, rect))) return [at.x, at.y];
  }
  return [base.x, base.y];
}

export interface PlanContext {
  t: number;
  nodes: KnowledgeNode[];
  /** 画布上已占用的矩形（含尺寸，不是点） */
  occupied: SlotRect[];
  /** 上一轮 AI 刚生成的节点，用于"把它连到 X" */
  lastSpawnedId?: string;
  nodeSize?: { width: number; height: number };
  /** 节点当前位置（用于"移到 X 旁边"）；调用方传 layout 快照即可 */
  positions?: Record<string, { x: number; y: number }>;
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

function clean(text: string): string {
  return text
    .trim()
    .replace(/[。！!？?，,]$/, "")
    .replace(QUANTIFIER, "")
    .trim();
}

/** 从文本里找出目标节点（先按标题，再按类型关键词） */
function findTarget(text: string, nodes: KnowledgeNode[]): KnowledgeNode | undefined {
  const byTitle = nodes.find((n) => text.includes(n.title) || n.title.includes(text));
  if (byTitle) return byTitle;
  const kind = inferKind(text);
  return kind === "concept" ? undefined : nodes.find((n) => n.kind === kind);
}

/** 从"连到 Y"里解析出目标节点 */
function findConnectTarget(text: string, nodes: KnowledgeNode[]): KnowledgeNode | undefined {
  const match = CONNECT_PATTERN.exec(text);
  const raw = match?.[1] ? clean(match[1]) : "";
  return raw ? findTarget(raw, nodes) : undefined;
}

export function plan(message: string, ctx: PlanContext): Plan {
  const text = message.trim();
  if (!text) return { calls: [], reply: "" };

  const size = ctx.nodeSize ?? DEFAULT_NODE_SIZE;
  const addMatch = ADD_PATTERN.exec(text);
  const connectTarget = findConnectTarget(text, ctx.nodes);

  // 提取正则分组（TS 对正则字面量推断分组可能是 undefined，这里折成 string）
  const g = (m: RegExpExecArray | null, i: number): string => (m?.[i] ?? "").trim();

  // 0) "给 X 加上摘要 Y" / "把 X 的摘要改成 Y" → updateNode(summary)
  //    必须先于 ADD："给网关加上摘要 …" 里也有"加上"，否则会被当成建节点
  const summaryMatch = SUMMARY_GIVE_PATTERN.exec(text) ?? SUMMARY_OF_PATTERN.exec(text);
  if (summaryMatch?.[2]) {
    const subject = findTarget(clean(g(summaryMatch, 1)), ctx.nodes);
    if (subject) {
      const summary = clean(g(summaryMatch, 2));
      return {
        calls: [{ name: "updateNode", input: { id: subject.id, summary } }],
        reply: `已把「${subject.title}」的摘要更新为：「${summary}」。`,
      };
    }
  }

  // 0.5) "把 X 改名为 Y" → updateNode(title)，新名是类型词时顺带改 kind
  const renameMatch = RENAME_PATTERN.exec(text);
  if (renameMatch?.[2]) {
    const subject = findTarget(clean(g(renameMatch, 1)), ctx.nodes);
    if (subject) {
      const input: UpdateNodeInput = { id: subject.id, title: clean(g(renameMatch, 2)) };
      const kind = inferKind(input.title ?? "");
      if (kind !== "concept") input.kind = kind;
      return {
        calls: [{ name: "updateNode", input }],
        reply: `已把「${subject.title}」改名为「${input.title}」。`,
      };
    }
  }

  // 0.8) "把 X 移到 Y 上面/旁边/左边…" → moveNode（目标若是人摆过的位置，executor 挂起等确认）
  const moveMatch = MOVE_PATTERN.exec(text);
  if (moveMatch?.[2]) {
    const subject = findTarget(clean(g(moveMatch, 1)), ctx.nodes);
    const destText = clean(g(moveMatch, 2));
    const anchor = findTarget(destText.replace(DIRECTION_WORDS, ""), ctx.nodes);
    if (subject && anchor && subject.id !== anchor.id) {
      const dir = DIRECTION_HINTS.find(([re]) => re.test(destText))?.[1] ?? "right";
      const positions = ctx.positions ?? {};
      const movingAt = positions[subject.id];
      // 排除被移动节点自己的旧位置：它马上要离开，不算障碍
      const others = ctx.occupied.filter(
        (r) => !movingAt || Math.abs(r.x - movingAt.x) > 0.5 || Math.abs(r.y - movingAt.y) > 0.5,
      );
      const at = slotBeside(positions, others, anchor.id, dir, size);
      return {
        calls: [{ name: "moveNode", input: { id: subject.id, x: at[0], y: at[1] } }],
        reply: `已把「${subject.title}」挪到「${anchor.title}」${DIRECTION_NAME[dir]}。`,
      };
    }
  }

  // 0.9) "把 X 连到 Y" → 指定起点的连线（不带"把"的短句走 lastSpawned 分支）
  const explicitConnect = CONNECT_SUBJECT_PATTERN.exec(text);
  if (explicitConnect?.[2]) {
    const from = findTarget(clean(g(explicitConnect, 1)), ctx.nodes);
    const to = findTarget(clean(g(explicitConnect, 2)), ctx.nodes);
    if (from && to && from.id !== to.id) {
      return {
        calls: [{ name: "connect", input: { from: from.id, to: to.id, kind: "calls", label: "接入" } }],
        reply: `已把「${from.title}」连到「${to.title}」。`,
      };
    }
  }

  // 1) "添加 X"（若同句还有"连到 Y"，一并接上）
  if (addMatch?.[1] && !/^(?:把|将)/.test(text)) {
    // "添加一个 Kafka 并连到后端服务" → 标题只取 "Kafka"
    const withoutConnect = addMatch[1].split(CONNECT_SPLIT)[0] ?? addMatch[1];
    const raw = clean(withoutConnect);
    if (raw) {
      const kind = inferKind(raw);
      const title = raw.length > 1 ? raw : (KIND_TITLE[kind] ?? "新节点");
      const id = `n-${slug(title)}-${ctx.nodes.length + 1}`;
      const at = freeSlot(ctx.occupied, size);

      const calls: CanvasToolCall[] = [{ name: "spawnNode", input: { id, kind, title, at } }];
      if (connectTarget) {
        calls.push({
          name: "connect",
          input: { from: id, to: connectTarget.id, kind: "calls", label: "接入" },
        });
      }

      return {
        calls,
        reply: connectTarget
          ? `已在画布上生成「${title}」并接到「${connectTarget.title}」。`
          : `已在画布上生成节点「${title}」（类型：${kind}）。\n它现在还没有连到链路上——你可以说"把它连到后端服务"。`,
      };
    }
  }

  // 1.5) "删掉 X" / "把 X 去掉" → deleteNode（目标若是人改过的，executor 会先挂起等确认）
  const deleteMatch = DELETE_PATTERN.exec(text) ?? DELETE_PATTERN_SUFFIX.exec(text);
  if (deleteMatch?.[1]) {
    const target = findTarget(clean(deleteMatch[1]), ctx.nodes);
    if (target) {
      return { calls: [{ name: "deleteNode", input: { id: target.id } }], reply: "" };
    }
  }

  // 2) "把它连到 Y" → 接上一轮生成的节点
  if (connectTarget && ctx.lastSpawnedId) {
    return {
      calls: [
        {
          name: "connect",
          input: { from: ctx.lastSpawnedId, to: connectTarget.id, kind: "calls", label: "接入" },
        },
        { name: "focus", input: { nodeId: ctx.lastSpawnedId } },
      ],
      reply: `已把上一轮生成的节点接到「${connectTarget.title}」。`,
    };
  }

  // 3) 命中已有节点 → focus + 旁白
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

  // 4) 只有关键词命中类型
  const kind = inferKind(text);
  if (kind !== "concept") {
    const existing = ctx.nodes.find((n) => n.kind === kind);
    if (existing) {
      return {
        calls: [
          { name: "focus", input: { nodeId: existing.id } },
          { name: "narrate", input: { text: `带你去看 ${existing.title}`, nodeId: existing.id } },
        ],
        reply: "",
      };
    }
    const title = KIND_TITLE[kind] ?? "新节点";
    const id = `n-${slug(title)}-${ctx.nodes.length + 1}`;
    return {
      calls: [
        { name: "spawnNode", input: { id, kind, title, at: freeSlot(ctx.occupied, size) } },
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
