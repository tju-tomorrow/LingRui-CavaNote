/**
 * 本地讲解器
 *
 * P0 阶段用确定性脚本代替真实 LLM，先把"点击节点 → 追问 → 得到解释"的闭环跑通。
 * 接真实模型时只需替换 ChatPanel 里的 adapter（见 chat/ChatPanel.tsx 的 TODO）。
 */
import { SEED_NODES } from "../collab/seed";

/** 每个基建实体的核心讲解 */
const EXPLAIN: Record<string, string[]> = {
  user: ["用户是链路的起点。", "浏览器发起一个 HTTP 请求，此时它不知道后端有多少台机器。"],
  gateway: [
    "为什么需要网关？因为客户端不应该知道后端有几个服务、部署在哪。",
    "① 统一入口：所有流量先经过这里，后端服务可以不对外暴露。",
    "② 鉴权与限流：安全性、稳定性在这里兜底，不用每个服务各写一遍。",
    "③ 路由转发：按规则把请求分发到对应服务，配合注册中心做服务发现。",
    "常见实现：Nginx、Kong、Spring Cloud Gateway。",
  ],
  service: [
    "后端服务是业务逻辑真正执行的地方。",
    "它拿到请求后依次做三件事：先查缓存，再走业务，最后按需投递消息并落库。",
  ],
  redis: [
    "Redis 挡在数据库前面，把热点数据放在内存里。",
    "注意这是「可选」步骤：缓存只是为了更快，它绝不能是数据的唯一来源。",
  ],
  mq: [
    "消息队列用来异步解耦。",
    "比如发短信、写日志、更新统计，这些不必让用户等，投递到 MQ 立刻返回即可。",
  ],
  db: [
    "数据库是最终持久化，也是链路里最慢、最需要保护的一环。",
    "所以前面才要缓存和消息队列替它分流。",
  ],
  registry: ["注册中心让服务能被「发现」而不是硬编码地址。", "常见实现：Nacos、Consul。"],
  monitor: ["监控与日志记录这条链路上发生的一切。", "没有它，线上出问题只能靠猜。"],
};

const FALLBACK = [
  "我可以解释这条请求链路里的任意一个节点。",
  "试试点击画布上的「API 网关」或「Redis 缓存」，我会针对那个节点展开。",
];

export function buildReply(question: string, nodeId: string | null): string {
  const node = SEED_NODES.find((n) => n.id === nodeId);
  if (!node) {
    return FALLBACK.join("\n");
  }

  const lines = EXPLAIN[node.id] ?? [`这是 ${node.title}。`];
  const header = question.trim()
    ? `关于「${node.title}」，你问的是：${question.trim()}`
    : `关于「${node.title}」`;

  const relations = node.relations.length
    ? `\n它的下游：${node.relations.map((r) => `${r.label ?? r.kind} → ${r.to}`).join("；")}`
    : "";

  return [header, "", ...lines, relations].join("\n");
}
