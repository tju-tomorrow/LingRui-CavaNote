/**
 * FAQ 追问落盘（PRD/知识模型.md §2.1 的 `FaqItem.a`）
 *
 * 详情卡里的「问一下」把问题塞进聊天面板，答案回来后写回 `node.faq[].a`。
 * 于是同一个问题不用反复问：下次打开详情卡直接能看到答案，导出文档也带上。
 *
 * 为什么用「登记 → 认领」而不是把问题塞进上下文：
 * 聊天面板是通用入口，用户也可能手敲一模一样的问题；用**问题文本**做匹配，
 * 只有"从详情卡点出去的那一次"会落盘，手敲的不会污染节点数据。
 */
import { readNode, upsertNode, type FaqItem } from "@lingrui/knowledge";
import { ydoc } from "../collab/doc";

interface PendingFaq {
  nodeId: string;
  faqId: string;
  question: string;
}

let pending: PendingFaq | null = null;

/** 详情卡点「问一下」时登记；question 必须与塞进聊天面板的文本完全一致 */
export function noteFaqQuestion(nodeId: string, faqId: string, question: string): void {
  pending = { nodeId, faqId, question };
}

/**
 * 一轮回答结束后调用。命中登记的问题 → 把答案写回该节点的 faq 项。
 * @returns 是否真的写入了（没命中 / 答案为空 / 内容没变都是 false）
 */
export function commitFaqAnswer(question: string, answer: string): boolean {
  if (!pending || pending.question !== question) return false;

  const { nodeId, faqId } = pending;
  pending = null;

  const text = answer.trim();
  if (!text) return false;

  const node = readNode(ydoc, nodeId);
  if (!node?.faq?.length) return false;

  let changed = false;
  const faq: FaqItem[] = node.faq.map((item) => {
    if (item.id !== faqId || item.a === text) return item;
    changed = true;
    return { ...item, a: text };
  });
  if (!changed) return false;

  // 只动 faq，不碰 provenance：答案挂在原有节点上，不改变它的归属
  upsertNode(ydoc, { ...node, faq });
  return true;
}

/** 调试用：当前是否有待认领的 FAQ 提问 */
export function hasPendingFaq(): boolean {
  return pending !== null;
}
