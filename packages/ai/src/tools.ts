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

/**
 * 枚举值——必须和 @lingrui/knowledge 的联合类型保持一致。
 * 写进 JSON schema 的 enum 里，模型才不会自己造词（早期不给 schema，
 * 模型会发 kind:"messaging"、用 x/y 代替 at，生成的节点全是坏的）。
 */
const NODE_KINDS = [
  "client",
  "gateway",
  "service",
  "cache",
  "database",
  "queue",
  "registry",
  "monitor",
  "concept",
  "note",
] as const;
const RELATION_KINDS = [
  "calls",
  "reads",
  "writes",
  "publishes",
  "subscribes",
  "references",
  "depends-on",
] as const;
const ANNOTATION_TYPES = ["draw", "sticky", "text", "highlight", "arrow", "shape"] as const;

const AT_SCHEMA = {
  type: "array",
  items: { type: "number" },
  minItems: 2,
  maxItems: 2,
  description:
    "[x, y] 画布坐标。按分层规划：用户→网关→服务→存储；同层节点纵向间隔 ≥ 160，层与层横向间隔 ≥ 320",
};

/** 工具描述表：给 LLM 看的能力清单（ADR-0011 §5）。params 直接作为 OpenAI function parameters。 */
export const CANVAS_TOOLS = {
  spawnNode: {
    description: "在画布上生成一个基建实体节点，并写入 Knowledge 层",
    when: "当讲解需要引入新实体时",
    params: {
      type: "object",
      required: ["id", "kind", "title", "at"],
      properties: {
        id: {
          type: "string",
          description: "稳定唯一 id：小写英文+短横线，如 kafka、api-gateway（不要用中文）",
        },
        kind: { type: "string", enum: NODE_KINDS, description: "基建类型" },
        title: { type: "string", description: "节点标题（中文，简洁，≤12 字）" },
        summary: { type: "string", description: "一句话说明这个节点干什么" },
        at: AT_SCHEMA,
      },
    },
  },
  updateNode: {
    description: "修改节点的标题 / 摘要 / 类型",
    when: "当要纠正或细化已有节点时",
    params: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string", description: "目标节点 id" },
        title: { type: "string" },
        summary: { type: "string" },
        kind: { type: "string", enum: NODE_KINDS },
      },
    },
  },
  moveNode: {
    description: "把节点挪到指定坐标",
    when: "当布局拥挤或需要重新分层时",
    params: {
      type: "object",
      required: ["id", "x", "y"],
      properties: {
        id: { type: "string", description: "目标节点 id" },
        x: { type: "number" },
        y: { type: "number" },
      },
    },
  },
  deleteNode: {
    description: "删除节点及其所有连线",
    when: "当确认某个实体不再相关时",
    params: {
      type: "object",
      required: ["id"],
      properties: { id: { type: "string", description: "目标节点 id" } },
    },
  },
  connect: {
    description: "在两个节点之间建立带语义的关系（calls/reads/writes/publishes…）",
    when: "当要说明谁调用谁、谁读写谁时",
    params: {
      type: "object",
      required: ["from", "to", "kind"],
      properties: {
        from: { type: "string", description: "起点节点 id" },
        to: { type: "string", description: "终点节点 id" },
        kind: { type: "string", enum: RELATION_KINDS, description: "关系语义" },
        label: { type: "string", description: "箭头上的中文短标签" },
      },
    },
  },
  disconnect: {
    description: "断开两个节点之间的关系",
    when: "当某条链路不再成立时",
    params: {
      type: "object",
      required: ["from", "to"],
      properties: { from: { type: "string" }, to: { type: "string" } },
    },
  },
  setStyle: {
    description: "设置节点的视觉样式（颜色、图标等）",
    when: "当要用颜色区分层次或强调某个节点时",
    params: {
      type: "object",
      required: ["id", "style"],
      properties: {
        id: { type: "string" },
        style: {
          type: "object",
          properties: { stroke: { type: "string" }, background: { type: "string" } },
        },
      },
    },
  },
  flow: {
    description: "播放一段从 A 到 B 的数据流动画",
    when: "当要演示一次请求/一条消息的走向时",
    params: {
      type: "object",
      required: ["from", "to"],
      properties: {
        from: { type: "string" },
        to: { type: "string" },
        label: { type: "string" },
      },
    },
  },
  focus: {
    description: "把镜头和吉祥物聚焦到某个节点",
    when: "当要强调某个实体时",
    params: {
      type: "object",
      required: ["nodeId"],
      properties: { nodeId: { type: "string", description: "目标节点 id" } },
    },
  },
  narrate: {
    description: "让吉祥物在某个时间点说一句话",
    when: "当需要旁白时",
    params: {
      type: "object",
      required: ["text"],
      properties: {
        text: { type: "string", description: "旁白文本，口语短句，≤30 字" },
        nodeId: { type: "string" },
      },
    },
  },
  annotate: {
    description: "在画布上添加标注（便签 / 手绘 / 高亮 / 形状），可挂到某个节点",
    when: "当需要给用户圈重点、写便签时",
    params: {
      type: "object",
      required: ["type", "element"],
      properties: {
        id: { type: "string", description: "省略则自动生成" },
        type: { type: "string", enum: ANNOTATION_TYPES },
        attachedTo: { type: "string", description: "挂到哪个节点；省略=自由标注" },
        text: { type: "string", description: "便签/文本内容" },
        element: {
          type: "object",
          required: ["x", "y", "width", "height"],
          properties: {
            x: { type: "number" },
            y: { type: "number" },
            width: { type: "number" },
            height: { type: "number" },
          },
        },
      },
    },
  },
  updateAnnotation: {
    description: "修改已有标注的文字或几何",
    when: "当要纠正标注位置或内容时",
    params: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string" },
        text: { type: "string" },
        element: { type: "object", description: "要改的几何字段（局部）" },
      },
    },
  },
  deleteAnnotation: {
    description: "删除一条标注",
    when: "当标注已经过时且确认要删时",
    params: {
      type: "object",
      required: ["id"],
      properties: { id: { type: "string" } },
    },
  },
} as const;

export type CanvasToolName = keyof typeof CANVAS_TOOLS;

export const TOOL_NAMES = Object.keys(CANVAS_TOOLS) as CanvasToolName[];

export const WRITE_TOOLS: CanvasToolName[] = [
  "spawnNode",
  "updateNode",
  "moveNode",
  "deleteNode",
  "connect",
  "disconnect",
  "setStyle",
  "annotate",
  "updateAnnotation",
  "deleteAnnotation",
];

/**
 * 模型自造的 kind 词 → 我们的 NodeKind。
 * 给了 enum 之后仍会出现（历史上下文、不同模型），兜一层比生成坏节点好。
 */
const KIND_ALIASES: Record<string, NodeKind> = {
  messaging: "queue",
  message: "queue",
  mq: "queue",
  broker: "queue",
  kafka: "queue",
  rabbitmq: "queue",
  db: "database",
  sql: "database",
  storage: "database",
  mysql: "database",
  postgres: "database",
  redis: "cache",
  memcached: "cache",
  caching: "cache",
  server: "service",
  microservice: "service",
  api: "service",
  backend: "service",
  browser: "client",
  user: "client",
  frontend: "client",
  web: "client",
  lb: "gateway",
  loadbalancer: "gateway",
  proxy: "gateway",
  nginx: "gateway",
  kong: "gateway",
  logging: "monitor",
  metrics: "monitor",
  observability: "monitor",
  prometheus: "monitor",
  discovery: "registry",
  nacos: "registry",
  consul: "registry",
  docs: "note",
};

/** 把任意字符串归一成合法 NodeKind（认不出来就给 concept） */
function normalizeKind(raw: unknown): NodeKind | undefined {
  if (typeof raw !== "string") return undefined;
  const value = raw.trim().toLowerCase();
  if ((NODE_KINDS as readonly string[]).includes(value)) return value as NodeKind;
  return KIND_ALIASES[value];
}

/**
 * 入参归一化——模型的输出不能全信。
 *
 * 实测（deepseek-v4.1-flash）会发 `type` 而不是 `kind`、用 `x`/`y` 而不是 `at`。
 * 给了 JSON schema 之后概率大降，但这里仍兜一层：坏参数进来只会让画布烂掉，
 * 而且**不会报错**（executor 不做形状校验），所以必须在这里拦住。
 */
function normalizeInput(name: CanvasToolName, raw: Record<string, unknown>): unknown {
  const input: Record<string, unknown> = { ...raw };

  if (name === "spawnNode" || name === "updateNode") {
    if (input.kind === undefined && input.type !== undefined) input.kind = input.type;
    delete input.type;
    if (input.kind !== undefined) {
      const kind = normalizeKind(input.kind);
      if (kind) {
        input.kind = kind;
      } else if (name === "spawnNode") {
        input.kind = "concept"; // 必填字段：宁可给 concept，也不能留坏值
      } else {
        delete input.kind; // updateNode：认不出就别改类型，否则会把原 kind 覆盖掉
      }
    } else if (name === "spawnNode") {
      input.kind = "concept";
    }
  }

  if (name === "spawnNode" && input.at === undefined) {
    const { x, y } = input as { x?: unknown; y?: unknown };
    if (typeof x === "number" && typeof y === "number") input.at = [x, y];
    delete input.x;
    delete input.y;
  }

  if (name === "connect") {
    if (input.from === undefined && typeof input.source === "string") input.from = input.source;
    if (input.to === undefined && typeof input.target === "string") input.to = input.target;
    if (input.kind === undefined && typeof input.relation === "string") input.kind = input.relation;
    if (typeof input.kind === "string") {
      const rel = input.kind.trim().toLowerCase().replace(/[\s_]/g, "-");
      // 模型常带修饰："publishes messages" / "depends on" → 取能认出来的那个
      const hit = RELATION_KINDS.find(
        (known) => rel === known || rel.startsWith(`${known}-`) || rel.includes(known),
      );
      input.kind = hit ?? "calls";
    }
  }

  if (name === "focus" && input.nodeId === undefined && typeof input.id === "string") {
    input.nodeId = input.id;
    delete input.id;
  }

  return input;
}

/** 把 LLM 返回的 tool 调用转成内部可执行的形状（含最小校验 + 归一化） */
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
  const normalized = normalizeInput(name as CanvasToolName, input as Record<string, unknown>);
  return { name: name as CanvasToolName, input: normalized } as CanvasToolCall;
}

export const SYSTEM_PROMPT = `你是 LingRui CavaNote 的基建讲解 Agent。

规则：
1. 你的输出不是长文，而是**动作流**。把知识拆成「节点出现 → 建立关系 → 数据流动 → 吉祥物讲解」。
2. 每个节点必须先 spawnNode 再被引用；坐标由你规划，尽量分层（用户 → 网关 → 服务 → 存储）。
3. 一次讲解不超过 8 个节点，否则观众会迷失。
4. 讲解文本用口语短句，配合时间轴，一句不超过 30 字。
5. 不要编造知识；不确定的内容标注「不确定」并给出追问建议。
6. 用户想养 / 换一只宠物老师时，用 createPet / setPetAppearance 等**宠物工具**，不要建画布节点。`;

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
