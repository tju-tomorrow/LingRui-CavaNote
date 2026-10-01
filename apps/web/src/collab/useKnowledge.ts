/**
 * 订阅 Y.Doc 里的 Knowledge 节点。
 *
 * 任何视图都不自己存节点，一律从这里读 —— 这是"一个 Knowledge，多个视图"的读取入口。
 */
import { useEffect, useState } from "react";
import { getOrder, getNodes, type KnowledgeNode } from "@lingrui/knowledge";
import { ydoc } from "./doc";

function snapshot(): KnowledgeNode[] {
  const nodes = getNodes(ydoc);
  const order = getOrder(ydoc).toArray();
  const ids = order.length > 0 ? order : [...nodes.keys()];
  const out: KnowledgeNode[] = [];
  for (const id of ids) {
    const node = nodes.get(id);
    if (node) out.push(node);
  }
  return out;
}

export function useKnowledgeNodes(): KnowledgeNode[] {
  const [nodes, setNodes] = useState<KnowledgeNode[]>(() => snapshot());

  useEffect(() => {
    const update = () => setNodes(snapshot());
    update();
    const nodesMap = getNodes(ydoc);
    const order = getOrder(ydoc);
    nodesMap.observeDeep(update);
    order.observe(update);
    return () => {
      nodesMap.unobserveDeep(update);
      order.unobserve(update);
    };
  }, []);

  return nodes;
}
