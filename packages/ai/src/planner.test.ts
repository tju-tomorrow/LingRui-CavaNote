import { describe, expect, test } from "bun:test";
import type { KnowledgeNode } from "@lingrui/knowledge";
import { freeSlot, inferKind, plan, slotBeside } from "./planner";

function node(id: string, kind: KnowledgeNode["kind"], title: string): KnowledgeNode {
  return { id, kind, title, relations: [] };
}

const NODES: KnowledgeNode[] = [
  node("user", "client", "用户"),
  node("gateway", "gateway", "API 网关"),
  node("service", "service", "后端服务"),
  node("redis", "cache", "Redis 缓存"),
];

const RECTS = [
  { x: 0, y: 0, width: 250, height: 96 },
  { x: 320, y: 0, width: 250, height: 96 },
  { x: 680, y: 0, width: 250, height: 96 },
];

describe("inferKind", () => {
  test("按关键词识别基建类型", () => {
    expect(inferKind("加一个 Kafka")).toBe("queue");
    expect(inferKind("postgres")).toBe("database");
    expect(inferKind("Nginx 网关")).toBe("gateway");
    expect(inferKind("随便什么")).toBe("concept");
  });
});

describe("freeSlot", () => {
  const SIZE = { width: 250, height: 96 };

  test("空画布从原点开始", () => {
    expect(freeSlot([], SIZE)).toEqual([0, 0]);
  });

  test("放在内容右侧，且与已有矩形不重叠", () => {
    const occupied = [
      { x: 0, y: 0, width: 250, height: 96 },
      { x: 320, y: 0, width: 250, height: 96 },
    ];
    const [x, y] = freeSlot(occupied, SIZE);
    expect(x).toBe(320 + 250 + 70);
    const candidate = { x, y, width: SIZE.width, height: SIZE.height };
    for (const r of occupied) {
      const overlap = x < r.x + r.width && r.x < x + SIZE.width && y < r.y + r.height && r.y < y + SIZE.height;
      expect(overlap).toBe(false);
    }
  });

  test("纵向与现有图谱居中对齐", () => {
    const occupied = [
      { x: 0, y: -180, width: 250, height: 96 },
      { x: 0, y: 180, width: 250, height: 96 },
    ];
    const [, y] = freeSlot(occupied, SIZE);
    expect(y).toBe(0); // ( -180 + 276 ) / 2 - 48
  });
});

describe("plan", () => {
  test("“添加 X” 产出 spawnNode", () => {
    const p = plan("添加一个 Kafka", { t: 0, nodes: NODES, occupied: RECTS });
    expect(p.calls).toHaveLength(1);
    expect(p.calls[0]).toMatchObject({
      name: "spawnNode",
      input: { kind: "queue", at: [1000, 0] },
    });
    expect(p.reply).toContain("Kafka");
  });

  test("“添加 X 并连到 Y” 同时产出 spawnNode + connect", () => {
    const p = plan("添加一个 Kafka 并连到后端服务", { t: 0, nodes: NODES, occupied: RECTS });
    expect(p.calls.map((c) => c.name)).toEqual(["spawnNode", "connect"]);
    const spawn = p.calls[0];
    if (spawn?.name === "spawnNode") {
      expect(spawn.input.title).toBe("Kafka"); // 连词不能混进标题
    }
    const conn = p.calls[1];
    if (conn?.name === "connect") {
      expect(conn.input.to).toBe("service"); // 按类型关键词落到"后端服务"
    }
  });

  test("“把它连到 Y” 接上一轮生成的节点", () => {
    const p = plan("把它连到 Redis", {
      t: 0,
      nodes: NODES,
      occupied: RECTS,
      lastSpawnedId: "n-kafka-4",
    });
    const conn = p.calls.find((c) => c.name === "connect");
    expect(conn?.name).toBe("connect");
    if (conn?.name === "connect") {
      expect(conn.input.from).toBe("n-kafka-4");
      expect(conn.input.to).toBe("redis");
    }
  });

  test("没有上一轮节点时，「把它连到」不产生调用", () => {
    const p = plan("把它连到 Redis", { t: 0, nodes: NODES, occupied: RECTS });
    expect(p.calls.some((c) => c.name === "connect")).toBe(false);
  });

  test("口语量词不会跑进标题", () => {
    const p = plan("添加一个 Kafka 消息队列", { t: 0, nodes: NODES, occupied: RECTS });
    const call = p.calls[0];
    expect(call?.name).toBe("spawnNode");
    if (call?.name === "spawnNode") {
      expect(call.input.title).toBe("Kafka 消息队列");
      expect(call.input.title.startsWith("一个")).toBe(false);
    }
  });

  test("提到已有节点 → focus + 旁白", () => {
    const p = plan("解释一下 Redis 缓存是干嘛的", { t: 0, nodes: NODES, occupied: [] });
    expect(p.calls.map((c) => c.name)).toEqual(["focus", "narrate"]);
  });

  test("提到链路上没有的类型 → 自动补节点并聚焦", () => {
    const p = plan("消息队列在这里干什么", { t: 0, nodes: NODES, occupied: [] });
    expect(p.calls.map((c) => c.name)).toEqual(["spawnNode", "focus"]);
    expect(p.reply).toContain("消息队列");
  });

  test("已经存在的类型不会重复添加", () => {
    const p = plan("缓存是怎么工作的", { t: 0, nodes: NODES, occupied: [] });
    // 命中已有节点 redis 的标题，走 focus 分支
    expect(p.calls.map((c) => c.name)).toEqual(["focus", "narrate"]);
  });

  test("无关问题不产生工具调用（交给默认讲解）", () => {
    const p = plan("你好呀", { t: 0, nodes: NODES, occupied: [] });
    expect(p.calls).toEqual([]);
    expect(p.reply).toBe("");
  });
});

describe("改名 / 改摘要（updateNode）", () => {
  test("「把 X 改名为 Y」→ updateNode title", () => {
    const p = plan("把网关改名为入口", { t: 0, nodes: NODES, occupied: [] });
    expect(p.calls).toHaveLength(1);
    expect(p.calls[0]).toMatchObject({
      name: "updateNode",
      input: { id: "gateway", title: "入口" },
    });
    expect(p.reply).toContain("入口");
  });

  test("新名是类型词时顺带改 kind", () => {
    const p = plan("把网关改成 MySQL", { t: 0, nodes: NODES, occupied: [] });
    const call = p.calls[0];
    expect(call?.name).toBe("updateNode");
    if (call?.name === "updateNode") {
      expect(call.input.title).toBe("MySQL");
      expect(call.input.kind).toBe("database");
    }
  });

  test("「给 X 加上摘要 Y」→ updateNode summary（不能被当成建节点）", () => {
    const p = plan("给 Redis 加上摘要 缓存热点数据", { t: 0, nodes: NODES, occupied: [] });
    expect(p.calls).toHaveLength(1);
    expect(p.calls[0]).toMatchObject({
      name: "updateNode",
      input: { id: "redis", summary: "缓存热点数据" },
    });
  });

  test("「把 X 的摘要改成 Y」也能识别", () => {
    const p = plan("把 Redis 的摘要改成 挡在读库之前的缓存", { t: 0, nodes: NODES, occupied: [] });
    const call = p.calls[0];
    expect(call?.name).toBe("updateNode");
    if (call?.name === "updateNode") {
      expect(call.input.id).toBe("redis");
      expect(call.input.summary).toBe("挡在读库之前的缓存");
    }
  });
});

describe("移动意图（moveNode）", () => {
  const POSITIONS = { gateway: { x: 0, y: 0 }, redis: { x: 680, y: 0 } };
  const SIZE = { width: 250, height: 96 };

  test("「把 X 挪到 Y 上面」→ moveNode 到 Y 上方空位", () => {
    const p = plan("把网关挪到 Redis 上面", {
      t: 0,
      nodes: NODES,
      occupied: RECTS,
      positions: POSITIONS,
    });
    const call = p.calls[0];
    expect(call?.name).toBe("moveNode");
    if (call?.name === "moveNode") {
      expect(call.input.id).toBe("gateway");
      expect(call.input.x).toBe(680);
      expect(call.input.y).toBe(-96 - 40); // redis.y - 高 - 间距
    }
  });

  test("没有方向词时默认放到锚点右边", () => {
    const p = plan("把网关放到 Redis 旁边", {
      t: 0,
      nodes: NODES,
      occupied: RECTS,
      positions: POSITIONS,
    });
    const call = p.calls[0];
    if (call?.name === "moveNode") {
      expect(call.input.x).toBe(680 + 250 + 40);
      expect(call.input.y).toBe(0);
    }
  });

  test("找不到锚点时不产生 moveNode", () => {
    const p = plan("把网关挪到不存在的东西上面", {
      t: 0,
      nodes: NODES,
      occupied: RECTS,
      positions: POSITIONS,
    });
    expect(p.calls.filter((c) => c.name === "moveNode")).toEqual([]);
  });
});

describe("slotBeside", () => {
  const POSITIONS = { redis: { x: 680, y: 0 } };
  const SIZE = { width: 250, height: 96 };

  test("右边有空位时直接落位", () => {
    const [x, y] = slotBeside(POSITIONS, [], "redis", "right", SIZE, 40);
    expect([x, y]).toEqual([680 + 250 + 40, 0]);
  });

  test("目标方向被挡住时继续向外找", () => {
    const blocked = [{ x: 970, y: 0, width: 250, height: 96 }];
    const [x, y] = slotBeside(POSITIONS, blocked, "redis", "right", SIZE, 40);
    expect([x, y]).toEqual([970 + 250 + 40, 0]);
  });
});

describe("指定起点连线（connect）", () => {
  test("「把 X 连到 Y」→ 从 X 连到 Y，不走 lastSpawned", () => {
    const p = plan("把网关连到 Redis 缓存", {
      t: 0,
      nodes: NODES,
      occupied: [],
      lastSpawnedId: "n-kafka-99",
    });
    const conn = p.calls[0];
    expect(conn?.name).toBe("connect");
    if (conn?.name === "connect") {
      expect(conn.input.from).toBe("gateway");
      expect(conn.input.to).toBe("redis");
    }
  });
});

describe("删除意图", () => {
  test("「删掉 X」产出 deleteNode", () => {
    const p = plan("删掉 Redis 缓存", { t: 0, nodes: NODES, occupied: RECTS });
    expect(p.calls).toHaveLength(1);
    expect(p.calls[0]).toMatchObject({ name: "deleteNode", input: { id: "redis" } });
  });

  test("按类型关键词也能定位（动词在后）", () => {
    const p = plan("把缓存去掉", { t: 0, nodes: NODES, occupied: RECTS });
    expect(p.calls[0]).toMatchObject({ name: "deleteNode", input: { id: "redis" } });
  });

  test("找不到目标时不产生调用", () => {
    const p = plan("删掉不存在的东西", { t: 0, nodes: NODES, occupied: RECTS });
    expect(p.calls.filter((c) => c.name === "deleteNode")).toEqual([]);
  });
});
