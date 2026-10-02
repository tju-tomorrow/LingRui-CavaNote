/**
 * @lingrui/ai — AI 编排层
 *
 * 两个方向：
 *   1. 解释：用户点节点 → 取 KnowledgeNode + 邻居 → 生成解释文本
 *   2. 演出：把解释编译成 SceneScript（见 @lingrui/anim）
 *
 * 工具定义同时服务于：
 *   - 前端 AI SDK 的 tool calling
 *   - 未来的 canvas MCP server
 *
 * 实际执行在 executor.ts —— 那里是唯一能改 Y.Doc 的地方。
 */
import { EMPHASIS_STYLES } from "@lingrui/anim";
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
  loadAsset: {
    description: "按需加载知识库资产：检索已定义的名词（标题/摘要/标签/类型），命中就用它的 id 复用",
    when: "讲到一个名词、要建节点之前，先查字典有没有已经定义好的资产",
    params: {
      type: "object",
      required: ["query"],
      properties: {
        query: { type: "string", description: "要谈的名词，如「网关」「Redis」「熔断」" },
        kinds: { type: "array", items: { type: "string", enum: NODE_KINDS }, description: "只在这些类型里找（可选）" },
        limit: { type: "number", description: "最多返回几个候选（默认 6）" },
      },
    },
  },
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
        shape: {
          type: "string",
          description:
            "形状 key（可选），来自 draw.io 全套形状库，格式 `<库>.<形状>`：如 networks.firewall、networks.load-balancer、networks.router、rack.general.1u-rack-server、kubernetes.pod",
        },
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
        shape: { type: "string", description: "换成 draw.io 形状库里的形状（格式 `<库>.<形状>`，如 networks.firewall）" },
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
  emphasize: {
    description: "给节点画一个手绘强调（圈 / 框 / 下划线 / 叉 / 高亮），让它“当场圈重点”",
    when: "当要突出某个节点时（比 focus 更醒目，适合视频演出）",
    params: {
      type: "object",
      required: ["nodeId", "style"],
      properties: {
        nodeId: { type: "string", description: "目标节点 id" },
        style: {
          type: "string",
          enum: ["circle", "box", "underline", "cross", "highlight"],
          description: "circle=圈重点，box=框起来，underline=下划线，cross=打叉（危险/不推荐），highlight=荧光笔",
        },
        text: { type: "string", description: "可选的附注文字" },
      },
    },
  },
  narrate: {
    description: "让吉祥物在某个时间点说一句话",
    when: "当需要旁白时（先图后文：节点/关系/流动都就绪后再 narrate）",
    params: {
      type: "object",
      required: ["text"],
      properties: {
        text: {
          type: "string",
          description:
            "旁白文本。ASD-STE100 风格：一句一个意思、主动语态、常见词；术语首次出现先定义。",
        },
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

/**
 * LingRui Script —— Agent 的「导演语言」（JSON + 工具意图 + 自然语言三合一）。
 *
 * 与其零散地逐个调工具，Agent 可以一次交出一段**有序动作流**：
 * 每一拍 = 一个工具意图（`do` + 该工具的参数）+ 一句旁白（`say`）。
 * 引擎按数组顺序执行、自动排时间、自动旁白。
 *
 * 为什么需要它：
 *   - 顺序：节奏是讲解的一部分，不能交给并行/乱序的工具调用。
 *   - 语言：`say` 与动作同处一拍，旁白不再和动作脱节。
 *   - 一次成形：整段讲解 = 一次工具调用，模型不必反复往返。
 */
export const DIRECT_TOOL = {
  description:
    "用 LingRui Script 一次性导演整段讲解：按顺序给出动作节拍（beat），每拍 = 一个工具意图（do）+ 该工具的参数 + 一句旁白（say）。引擎按顺序执行并自动排时间。讲清一个主题时优先用它，而不是零散地逐个调工具。",
  when: "当要完整讲清一个主题，或需要明确的先后节奏时",
  params: {
    type: "object",
    required: ["beats"],
    properties: {
      title: { type: "string", description: "这段讲解的标题（简短）" },
      beats: {
        type: "array",
        minItems: 1,
        description: "有序的动作节拍；引擎按数组顺序执行",
        items: {
          type: "object",
          required: ["do"],
          properties: {
            do: {
              type: "string",
              enum: [
                "spawnNode",
                "updateNode",
                "moveNode",
                "deleteNode",
                "connect",
                "disconnect",
                "setStyle",
                "flow",
                "focus",
                "emphasize",
                "annotate",
                "updateAnnotation",
                "deleteAnnotation",
                "writeNote",
                "newCanvas",
              ],
              description: "这一拍用哪个工具",
            },
            say: {
              type: "string",
              description:
                "这一拍的旁白（ASD-STE100 风格：一句一个意思、主动语态、常见词）；省略则无旁白",
            },
          },
          // 其余字段 = 该 do 对应工具的入参，平铺在同一拍上
          additionalProperties: true,
        },
      },
    },
  },
} as const;

/**
 * 笔记 / 画布结构工具 —— 在 web 层执行（不进 executor，因为它们要碰编辑器）。
 *
 * `writeNote`：扩展**笔记**；`newCanvas`：开一张新的**概念画布**并嵌入笔记。
 * 与画布工具分开，是为了让 Agent 能区分「改图」和「写笔记」两件事。
 */
export const NOTE_TOOLS = {
  writeNote: {
    description: "把内容写进当前笔记（扩展笔记，而不是改画布）",
    when: "当用户要「整理成笔记 / 补一段说明 / 把结论写下来」时",
    params: {
      type: "object",
      properties: {
        text: { type: "string", description: "要写入笔记的一段正文（Markdown 风格纯文本）" },
        nodeId: {
          type: "string",
          description: "省略则写 text；给了则把该知识节点作为卡片写进笔记",
        },
      },
    },
  },
  newCanvas: {
    description: "新建一张概念画布并嵌入当前笔记（1 篇笔记可以有多个概念画布）",
    when: "当要为一个新概念单独开一张图时",
    params: {
      type: "object",
      properties: {
        title: { type: "string", description: "画布标题（这个概念的名字）" },
        noteId: { type: "string", description: "省略则挂到当前打开的笔记" },
      },
    },
  },
} as const;

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

  if (name === "emphasize") {
    if (input.nodeId === undefined && typeof input.id === "string") input.nodeId = input.id;
    if (input.style === undefined && input.type !== undefined) input.style = input.type;
    if (typeof input.style === "string") {
      const s = input.style.trim().toLowerCase();
      const aliases: Record<string, string> = {
        ellipse: "circle",
        round: "circle",
        rect: "box",
        rectangle: "box",
        square: "box",
        line: "underline",
        under: "underline",
        x: "cross",
        strike: "cross",
        hl: "highlight",
        marker: "highlight",
      };
      const style = aliases[s] ?? s;
      input.style = EMPHASIS_STYLES.includes(style as never) ? style : "circle";
    }
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

你的产物分两层：
- **图（主）**：节点 + 关系 + 数据流。让人一眼看到「谁连谁、数据怎么走、哪里会出问题」。
- **文（辅）**：旁白字幕。只补图里看不出的那一句，不重复图已经说清的。

规则：
1. **先图后文**。每个概念先 spawnNode、再 connect，最后才 narrate。能画成图就不要写成段落。
2. 结构优先：调用链用 connect；数据流向用 flow；**当场圈重点用 emphasize（手绘圈/框/下划线/高亮，临时）**；
   持久改样式才用 setStyle；聚焦镜头用 focus。
3. 每个节点必须先 spawnNode 再被引用；坐标由你规划，尽量分层（用户 → 网关 → 服务 → 存储）。
4. 节点数量**以讲清楚为准**：该拆就拆，不要为了“简短”省略关键环节；
   图大了就用分镜（章节）组织节奏，而不是砍内容。
5. 旁白遵守 **ASD-STE100**（约 80% 严格度）：一句话一个意思；主动语态、现在时；用常见词；
   不用比喻/成语/模糊词；术语首次出现用一句话定义。长就多讲几句，但每句都要能单独读懂。
6. 旁白像 3Blue1Brown 的解说：短、准、有节奏；配合 focus 聚焦当前节点，让镜头跟着讲解走，而不是念稿。
7. 不要编造知识；不确定的内容标注「不确定」并给出追问建议。
8. 用户想养 / 换一只宠物老师时，用 createPet / setPetAppearance 等**宠物工具**，不要建画布节点。
10. **先查字典，再命名（知识资产，ADR-0014）**：每次 spawnNode 之前先 loadAsset 查知识库；
    命中已有资产的，**用它的 id 和解释直接复用**（解释/形态/关系全继承，不重复造名词）；
    只有确实没有时才新建。新建时给它完整解释（summary + 2~4 条 roles），让它在知识库里可复用。
9. 讲清一个主题时，**优先用 direct 一次给出整段有序节拍**（每拍 = 工具意图 do + 参数 + 一句 say），
   而不是零散地逐个调工具。say 写旁白，动作参数平铺在同一拍上。`;

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
