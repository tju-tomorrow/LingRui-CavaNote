/**
 * 初始知识库 —— 一次请求的完整旅程
 *
 * 这份数据是"唯一真相"的种子：文档视图（BlockNote）和画布视图（Excalidraw）
 * 都从它派生，而不是各存一份。
 */
import { DEFAULT_NODE_SIZE } from "@lingrui/ai";
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
    roles: [
      "统一入口：所有请求先经过网关",
      "鉴权与限流：保障系统安全与稳定",
      "路由转发：根据规则转发到后端服务",
      "监控统计：收集请求日志与性能数据",
    ],
    faq: [
      { id: "faq-gw-1", q: "如何设计一个高可用的 API 网关？" },
      { id: "faq-gw-2", q: "Nginx 与 Kong 的区别是什么？" },
      { id: "faq-gw-3", q: "网关如何实现灰度发布？" },
    ],
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
  {
    id: "redis",
    kind: "cache",
    title: "Redis 缓存",
    summary: "可选，挡在读库之前",
    roles: [
      "缓存热点数据，降低数据库读压力",
      "支持多种数据结构（String / Hash / List / ZSet）",
      "可选步骤：缓存绝不能是数据的唯一来源",
    ],
    meta: { tech: ["Redis", "Valkey"] },
    faq: [
      { id: "faq-redis-1", q: "缓存穿透 / 击穿 / 雪崩分别怎么解决？" },
      { id: "faq-redis-2", q: "为什么用 Redis 而不是本地缓存？" },
    ],
    relations: [],
  },
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
/**
 * 节点尺寸：**唯一来源是 @lingrui/ai 的 DEFAULT_NODE_SIZE**。
 * 早先 web 和 ai 各有一份，一旦漂移空位就算错（新节点会压在一起）。
 */
export const NODE_SIZE = DEFAULT_NODE_SIZE;

export type NodeLayout = Record<string, { x: number; y: number }>;

/** 默认布局：拖动后的位置会覆盖到这里（存在 Y.Doc 的 layout map） */
export const DEFAULT_LAYOUT: NodeLayout = {
  user: { x: 0, y: 0 },
  gateway: { x: 320, y: 0 },
  service: { x: 680, y: 0 },
  redis: { x: 1020, y: -180 },
  mq: { x: 1020, y: 0 },
  db: { x: 1020, y: 180 },
  registry: { x: 320, y: 220 },
  monitor: { x: 680, y: 220 },
};
