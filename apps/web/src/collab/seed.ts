/**
 * 初始知识库 —— 一次请求的完整旅程
 *
 * 这份数据是"唯一真相"的种子：文档视图（BlockNote）和画布视图（Excalidraw）
 * 都从它派生，而不是各存一份。
 */
import type { KnowledgeNode } from "@lingrui/knowledge";

export const SEED_NODES: KnowledgeNode[] = [
  {
    id: "user",
    kind: "client",
    title: "用户",
    summary: "发起请求的一方",
    relations: [{ id: "r-user-gw", to: "gateway", kind: "calls", label: "HTTP" }],
  },
  {
    id: "gateway",
    kind: "gateway",
    title: "API 网关 (Gateway)",
    summary: "统一入口：鉴权、限流、路由",
    relations: [
      { id: "r-gw-svc", to: "service", kind: "calls", label: "路由 & 调用" },
      { id: "r-gw-reg", to: "registry", kind: "depends-on", label: "服务发现" },
    ],
    meta: { tech: ["Nginx", "Kong", "Spring Cloud Gateway"] },
  },
  {
    id: "service",
    kind: "service",
    title: "后端服务 (Service)",
    summary: "业务逻辑所在",
    relations: [
      { id: "r-svc-cache", to: "redis", kind: "reads", label: "缓存查询" },
      { id: "r-svc-mq", to: "mq", kind: "publishes", label: "发送消息" },
      { id: "r-svc-db", to: "db", kind: "writes", label: "读写数据" },
      { id: "r-svc-mon", to: "monitor", kind: "depends-on", label: "上报指标" },
    ],
  },
  { id: "redis", kind: "cache", title: "Redis 缓存", summary: "可选，挡在读库之前", relations: [] },
  { id: "mq", kind: "queue", title: "消息队列 (MQ)", summary: "异步解耦", relations: [] },
  {
    id: "db",
    kind: "database",
    title: "数据库 (MySQL/PG)",
    summary: "最终持久化",
    relations: [],
  },
  { id: "registry", kind: "registry", title: "注册中心", summary: "Nacos / Consul", relations: [] },
  { id: "monitor", kind: "monitor", title: "监控 / 日志", summary: "Prometheus / ELK", relations: [] },
];

/** 画布上节点的统一尺寸（表现层） */
export const NODE_SIZE = { width: 250, height: 96 } as const;

/** 画布布局（位置属于"表现"，不属于 Knowledge） */
export const LAYOUT: Record<string, { x: number; y: number }> = {
  user: { x: 0, y: 0 },
  gateway: { x: 320, y: 0 },
  service: { x: 680, y: 0 },
  redis: { x: 1020, y: -180 },
  mq: { x: 1020, y: 0 },
  db: { x: 1020, y: 180 },
  registry: { x: 320, y: 220 },
  monitor: { x: 680, y: 220 },
};
