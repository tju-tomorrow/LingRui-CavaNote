/**
 * 订阅 Y.Doc 里的 Knowledge 节点与布局。
 *
 * 任何视图都不自己存节点，一律从这里读 —— 这是"一个 Knowledge，多个视图"的读取入口。
 */
import { useEffect, useState } from "react";
import {
  getAnnotations,
  getChapters,
  getLayout,
  getNodes,
  getNotes,
  getOrder,
  listChapters,
  listNotes,
  type Annotation,
  type Chapter,
  type KnowledgeNode,
  type NoteMeta,
} from "@lingrui/knowledge";
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

/** 按 id 排序的注释列表（排序是为了让依赖它的 memo 稳定） */
function listAnnotations(): Annotation[] {
  return [...getAnnotations(ydoc).values()].sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * 订阅 Annotation（用户画的东西）。
 *
 * 这是「Annotation 是一等公民」在读取侧的体现：手绘/便签不再只是
 * Excalidraw 内存里的 foreign element，而是进 Y.Doc、可持久化、可协同、可被 AI 引用。
 */
export function useAnnotations(): Annotation[] {
  const [annotations, setAnnotations] = useState<Annotation[]>(() => listAnnotations());

  useEffect(() => {
    const update = () => setAnnotations(listAnnotations());
    update();
    const map = getAnnotations(ydoc);
    map.observe(update);
    return () => map.unobserve(update);
  }, []);

  return annotations;
}

/**
 * 订阅 Y.Doc 里的章节 / 分镜（ROOT_CHAPTERS）。
 *
 * 分镜最初由动作流推导种进来（见 chat/agent.ts 的 shotsOf），
 * 之后人工编辑改的都是这份 → 这里永远是最新且可持续化的。
 */
export function useKnowledgeChapters(): Chapter[] {
  const [chapters, setChapters] = useState<Chapter[]>(() => listChapters(ydoc));

  useEffect(() => {
    const update = () => setChapters(listChapters(ydoc));
    update();
    const arr = getChapters(ydoc);
    arr.observe(update);
    return () => arr.unobserve(update);
  }, []);

  return chapters;
}

/**
 * 订阅笔记列表（ROOT_NOTES）。
 *
 * 「知识是全局的、笔记是多份的」：节点列表不随笔记切换而变，
 * 所以笔记树与命令面板都从这里读，互不影响。
 */
export function useKnowledgeNotes(): NoteMeta[] {
  const [notes, setNotes] = useState<NoteMeta[]>(() => listNotes(ydoc));

  useEffect(() => {
    const update = () => setNotes(listNotes(ydoc));
    update();
    const map = getNotes(ydoc);
    map.observe(update);
    return () => map.unobserve(update);
  }, []);

  return notes;
}

/** 按 id 取单个节点（节点数量小，线性查找足够） */
export function useKnowledgeNode(nodeId: string | undefined): KnowledgeNode | undefined {
  const nodes = useKnowledgeNodes();
  return nodeId ? nodes.find((n) => n.id === nodeId) : undefined;
}
