/**
 * 导出（PRD/导出与分发.md §1）
 *
 * P1.5 版产出 **Markdown**：文档正文（BlockNote → markdown）+ 知识节点
 * （摘要 / 核心作用 / 常见实现 / 关系 / 相关知识），数据来自「唯一真相」Y.Doc。
 * 视频（Revideo）与 PDF 为 P4 后半段。
 */
import type { KnowledgeNode } from "@lingrui/knowledge";
import { docToMarkdown } from "../editor/bridge";

const KIND_LABEL: Record<string, string> = {
  client: "调用方",
  gateway: "基础设施",
  service: "服务",
  cache: "缓存",
  database: "数据库",
  queue: "消息队列",
  registry: "注册中心",
  monitor: "监控",
  concept: "概念",
  note: "笔记",
};

/** 画布坐标 → 人类可读的节点关系（nodeId → 标题） */
function titleOf(nodes: KnowledgeNode[], id: string): string {
  return nodes.find((n) => n.id === id)?.title ?? id;
}

export async function buildMarkdown(
  title: string,
  subtitle: string,
  nodes: KnowledgeNode[],
): Promise<string> {
  const doc = await docToMarkdown();
  const lines: string[] = [`# ${title}`, "", `> ${subtitle}`, ""];

  if (doc.trim()) {
    lines.push(doc.trim(), "");
  }

  lines.push("---", "", "## 知识节点", "");

  for (const node of nodes) {
    lines.push(`### ${node.title}（${KIND_LABEL[node.kind] ?? node.kind}）`);

    if (node.summary) lines.push("", node.summary);

    const roles = node.roles ?? [];
    if (roles.length) {
      lines.push("", "**核心作用**");
      for (const r of roles) lines.push(`- ${r}`);
    }

    const tech = Array.isArray(node.meta?.["tech"]) ? (node.meta?.["tech"] as string[]) : [];
    if (tech.length) lines.push("", `**常见实现**：${tech.join("、")}`);

    if (node.relations.length) {
      const rels = node.relations.map((r) => `${r.label ?? r.kind} → ${titleOf(nodes, r.to)}`);
      lines.push("", `**关系**：${rels.join("；")}`);
    }

    const faq = node.faq ?? [];
    if (faq.length) {
      lines.push("", "**相关知识**");
      for (const f of faq) lines.push(`- ${f.q}`);
    }

    if (node.tags?.length) lines.push("", `**标签**：${node.tags.join("、")}`);

    lines.push("");
  }

  return lines.join("\n");
}

/** 触发浏览器下载 */
export function downloadText(filename: string, content: string, mime = "text/markdown"): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
