import { describe, expect, test } from "bun:test";
import type { KnowledgeNode } from "@lingrui/knowledge";
import {
  buildGraphSpec,
  edgeOf,
  nodeLabel,
  planGraphSync,
  vertexOf,
  type Layout,
} from "./mxgraph-binding";

const db: KnowledgeNode = {
  id: "db",
  kind: "database",
  title: "数据库",
  summary: "最终持久化",
  relations: [],
};

const svc: KnowledgeNode = {
  id: "svc",
  kind: "service",
  title: "后端服务",
  relations: [
    { id: "r-svc-db", to: "db", kind: "writes", label: "读写" },
    { id: "r-svc-ghost", to: "ghost", kind: "calls" },
  ],
};

describe("vertexOf", () => {
  test("cell id 就是 nodeId（稳定可寻址）", () => {
    const v = vertexOf(db, { db: { x: 10, y: 20 } });
    expect(v.id).toBe("db");
    expect(v.customData.nodeId).toBe("db");
  });

  test("数据库用圆柱，不是矩形", () => {
    const v = vertexOf(db, { db: { x: 0, y: 0 } });
    expect(v.style.shape).toBe("cylinder");
  });

  test("网关用六边形、客户端用人物", () => {
    expect(vertexOf({ ...db, kind: "gateway" }, {}).style.shape).toBe("hexagon");
    expect(vertexOf({ ...db, kind: "client" }, {}).style.shape).toBe("actor");
  });

  test("缺 location 时退回原点而不是 NaN", () => {
    const v = vertexOf(db, {});
    expect(v.x).toBe(0);
    expect(v.y).toBe(0);
  });

  test("标签是标题 + 摘要两行（纯文本，便于 SVG 导出）", () => {
    const label = nodeLabel({ ...db, title: "数据库", summary: "最终持久化" });
    expect(label).toBe("数据库\n最终持久化");
    expect(nodeLabel({ ...db, summary: undefined })).toBe("数据库");
  });
});

describe("edgeOf", () => {
  test("边 id 稳定为 edge-<relationId>", () => {
    const edge = edgeOf(svc, svc.relations[0]!);
    expect(edge.id).toBe("edge-r-svc-db");
    expect(edge.source).toBe("svc");
    expect(edge.target).toBe("db");
  });

  test("关系语义 → 线型：writes 实线方块箭头，depends-on 虚线", () => {
    expect(edgeOf(svc, svc.relations[0]!).style.dashed).toBe(false);
    expect(edgeOf(svc, svc.relations[0]!).style.endArrow).toBe("block");
    const dep = edgeOf(svc, { id: "r", to: "db", kind: "depends-on" });
    expect(dep.style.dashed).toBe(true);
  });

  test("正交布线由 edgeStyle 交给 maxGraph", () => {
    expect(edgeOf(svc, svc.relations[0]!).style.edgeStyle).toBe("orthogonalEdgeStyle");
  });
});

describe("buildGraphSpec", () => {
  test("跳过指向不存在节点的悬空关系", () => {
    const spec = buildGraphSpec([svc, db], {});
    expect(spec.vertices.map((v) => v.id).sort()).toEqual(["db", "svc"]);
    expect(spec.edges.map((e) => e.id)).toEqual(["edge-r-svc-db"]);
  });

  test("注释一并进 GraphSpec（Annotation 链路接回）", () => {
    const spec = buildGraphSpec([db], {}, [
      {
        id: "a1",
        type: "sticky",
        element: { type: "sticky", x: 0, y: 0, width: 10, height: 10 },
        provenance: { origin: "human" },
      },
    ]);
    expect(spec.annotations.map((a) => a.id)).toEqual(["a1"]);
  });
});

describe("planGraphSync", () => {
  test("新增 / 更新 / 删除计数", () => {
    const spec = buildGraphSpec([svc, db], {});
    const plan = planGraphSync(spec, { lingruiIds: ["db", "stale"] });
    // db 已存在 → 更新；svc 新增；edge-r-svc-db 新增；stale 删除
    expect(plan.stats.added).toBe(2);
    expect(plan.stats.updated).toBe(1);
    expect(plan.removeIds).toEqual(["stale"]);
  });

  test("空场景时全部新增", () => {
    const spec = buildGraphSpec([db], {});
    const plan = planGraphSync(spec, { lingruiIds: [] });
    expect(plan.stats.added).toBe(1);
    expect(plan.stats.removed).toBe(0);
  });
});

describe("Layout 类型", () => {
  test("layout 是 nodeId → {x,y}", () => {
    const layout: Layout = { db: { x: 1, y: 2 } };
    expect(layout["db"]!.x).toBe(1);
  });
});
