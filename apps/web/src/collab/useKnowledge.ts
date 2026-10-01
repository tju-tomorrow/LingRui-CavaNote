/**
 * 订阅 Y.Doc 里的 Knowledge 节点与布局。
 *
 * 任何视图都不自己存节点，一律从这里读 —— 这是"一个 Knowledge，多个视图"的读取入口。
 */
import { useEffect, useState } from "react";
import { getLayout, getNodes, getOrder, type KnowledgeNode } from "@lingrui/knowledge";
import { ydoc } from "./doc";
import { layoutSnapshot } from "./layout";
import type { NodeLayout } from "./seed";

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

export function useKnowledgeLayout(): NodeLayout {
  const [layout, setLayout] = useState<NodeLayout>(() => layoutSnapshot());

  useEffect(() => {
    const update = () => setLayout(layoutSnapshot());
    update();
    const layoutMap = getLayout(ydoc);
    layoutMap.observe(update);
    return () => layoutMap.unobserve(update);
  }, []);

  return layout;
}

/** 按 id 取单个节点（节点数量小，线性查找足够） */
export function useKnowledgeNode(nodeId: string | undefined): KnowledgeNode | undefined {
  const nodes = useKnowledgeNodes();
  return nodeId ? nodes.find((n) => n.id === nodeId) : undefined;
}
