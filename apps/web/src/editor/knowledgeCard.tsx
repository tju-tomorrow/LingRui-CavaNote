/**
 * 知识卡片块 —— 文档与画布之间的桥
 *
 * 这是"一个 KnowledgeNode，多个视图"在文档侧的表现：
 * 块只存 `props.nodeId`，标题/摘要都从 Y.Doc 实时读，节点改名了卡片自动跟着变。
 * 点击卡片 = 聚焦该节点（画布与聊天都会响应）。
 */
import { createReactBlockSpec } from "@blocknote/react";
import { useKnowledgeNode } from "../collab/useKnowledge";
import { setFocus } from "../state/focus";

const KIND_LABEL: Record<string, string> = {
  client: "调用方",
  gateway: "网关",
  service: "服务",
  cache: "缓存",
  database: "数据库",
  queue: "消息队列",
  registry: "注册中心",
  monitor: "监控",
  concept: "概念",
  note: "笔记",
};

export const knowledgeCard = createReactBlockSpec(
  {
    type: "knowledgeCard",
    propSchema: {
      nodeId: { default: "" },
    },
    content: "none",
  },
  {
    render: ({ block }) => {
      const nodeId = block.props.nodeId;
      const node = useKnowledgeNode(nodeId);

      return (
        <div
          className="knowledge-card"
          contentEditable={false}
          role="button"
          tabIndex={0}
          onClick={() => setFocus(nodeId)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") setFocus(nodeId);
          }}
        >
          <span className="kc-kind">{KIND_LABEL[node?.kind ?? ""] ?? "知识"}</span>
          <span className="kc-title">{node?.title ?? `未知节点 (${nodeId})`}</span>
          {node?.summary ? <span className="kc-summary">{node.summary}</span> : null}
        </div>
      );
    },
  },
  // 无 inline content，不需要 contentRef
);
