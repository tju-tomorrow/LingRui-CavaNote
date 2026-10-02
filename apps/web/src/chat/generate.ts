/**
 * 「从一个主题 / 从一篇笔记」生成画布与讲解。
 *
 * 这是空状态的入口，也是「笔记 → 可讲解的图」的入口。
 *
 *   1. 从主题：把请求交给 AI 对话（**必须连上 AI**，没有本地降级）。
 *   2. 从笔记：直接读当前文档的标题结构，编译成「节点 + 连线 + 旁白」，
 *      **不依赖任何文本解析、不设节点上限** —— 笔记有多少节就画多少节。
 */
import { createNote, noteText, type NoteMeta } from "@lingrui/knowledge";
import { inferKind } from "@lingrui/ai";
import { ydoc } from "../collab/doc";
import { noteOutline } from "../editor/bridge";
import { setActiveNote } from "../state/notes";
import { setCanvasOpen } from "../state/layout";
import { askLingRui } from "./ask";
import { runToolCall } from "./agent";
import { toast } from "../shell/actions";

/**
 * 从一个主题起步：
 *   建一篇同名笔记 → 展开画布 → 让 AI 生成知识画布与讲解。
 *
 * 先建笔记、先开画布，是为了「点了就一定有东西出现」——
 * 即使模型很慢或不可用，用户也已经拿到一篇可写的笔记和一个画布。
 */
export function generateFromTopic(topic: string): void {
  const title = topic.trim();
  if (!title) return;

  const note = createNote(ydoc, title);
  setActiveNote(note.id);
  setCanvasOpen(true);

  const prompt = `生成画布并讲解主题：${title}`;
  // 必须交给 AI 对话（本应用不降级到本地 planner）。
  // 面板还没挂好（极端时序）——如实报错，不假装还能生成。
  if (!askLingRui(prompt)) {
    toast("AI 对话面板还没就绪，请稍后重试（本应用需要连接 AI 服务）");
  }
}

/** 把一篇笔记的标题结构编译成一张流程图，并逐节配旁白 */
export function generateFromNote(note: NoteMeta): number {
  setCanvasOpen(true);

  const outline = noteOutline();
  // 没有标题结构（或者标题为空）→ 至少把整篇笔记本身放上画布
  const sections =
    outline.length > 0
      ? outline
      : [
          {
            level: 1,
            title: note.title,
            body: noteText(ydoc, note).slice(0, 120),
          },
        ];

  const base = Date.now().toString(36);
  let prev: string | undefined;

  sections.forEach((section, index) => {
    const id = `sec-${base}-${index}`;
    // 蛇形布局：一行放 4 个就折到下一行，避免超宽的一字长蛇
    const col = index % 4;
    const row = Math.floor(index / 4);
    const at: [number, number] = [col * 320, row * 200];

    runToolCall("spawnNode", {
      id,
      kind: inferKind(section.title),
      title: section.title,
      summary: section.body || section.title,
      at,
    });
    // 章节之间用「references」串成一条主线（第一节没有前驱）
    if (prev) runToolCall("connect", { from: prev, to: id, kind: "references", label: "下一节" });
    runToolCall("focus", { nodeId: id });
    runToolCall("narrate", { nodeId: id, text: section.body || section.title });

    prev = id;
  });

  return sections.length;
}
