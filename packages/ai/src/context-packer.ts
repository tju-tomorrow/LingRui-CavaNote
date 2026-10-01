/**
 * Context Packer —— 把「用户改过的现状」回灌给 AI（ADR-0011 决策 4）
 *
 * 为什么截图和数据要一起给：
 *   只给数据 → 看不出用户圈了哪块、便签写了啥、布局是否拥挤（视觉意图）
 *   只给截图 → 认不出元素 id，改不精确、无法引用（可寻址性）
 *
 * 关键约束：**同一版本冻结**。`freezeContext()` 先定下 version，
 * 截图和结构化数据都打上它，否则两者会漂移（AI 看到的位置对不上 id）。
 */
import type * as Y from "yjs";
import { serializeScene, type CanvasSnapshot, type SnapshotViewport } from "@lingrui/knowledge";

export interface FrozenContext {
  version: number;
  snapshot: CanvasSnapshot;
  /** data URL（`data:image/png;base64,...`）；截图失败时为 undefined */
  screenshot?: string;
}

export interface FreezeOptions {
  version: number;
  viewport: SnapshotViewport;
  focus?: string;
  screenshot?: string;
  nodeSize?: [number, number];
  now?: () => number;
}

export function freezeContext(doc: Y.Doc, options: FreezeOptions): FrozenContext {
  const snapshot = serializeScene(doc, {
    version: options.version,
    viewport: options.viewport,
    focus: options.focus,
    nodeSize: options.nodeSize,
    now: options.now,
  });
  return { version: options.version, snapshot, screenshot: options.screenshot };
}

/**
 * 把结构化数据压成给模型读的紧凑文本。
 *
 * 刻意保留 `id=`：模型只能按 id 增删改，禁止「照着重画一个」（ADR-0011 不变量 4）。
 */
export function snapshotToPrompt(snapshot: CanvasSnapshot): string {
  const lines: string[] = [];
  const { viewport } = snapshot;

  lines.push(
    `画布版本 v${snapshot.version}（zoom=${viewport.zoom.toFixed(2)}, ` +
      `viewport=${Math.round(viewport.width)}x${Math.round(viewport.height)}）`,
  );

  lines.push("", `节点（${snapshot.nodes.length}）：`);
  for (const node of snapshot.nodes) {
    const flags = node.provenance?.origin === "human" ? " [人改过]" : "";
    const roles = node.roles?.length ? ` 要点=${node.roles.join(" / ")}` : "";
    lines.push(
      `- id=${node.id} kind=${node.kind}「${node.title}」 ` +
        `at=(${node.at[0]},${node.at[1]}) size=${node.size[0]}x${node.size[1]}${roles}${flags}`,
    );
  }

  if (snapshot.relations.length) {
    lines.push("", `关系（${snapshot.relations.length}）：`);
    for (const rel of snapshot.relations) {
      const label = rel.label ? `「${rel.label}」` : "";
      lines.push(`- ${rel.from} → ${rel.to} (${rel.kind})${label}`);
    }
  }

  if (snapshot.annotations.length) {
    lines.push("", `标注（${snapshot.annotations.length}）：`);
    for (const anno of snapshot.annotations) {
      const text = anno.text ? ` text=${JSON.stringify(anno.text)}` : "";
      const attached = anno.attachedTo ? ` attachedTo=${anno.attachedTo}` : " 自由标注";
      lines.push(
        `- id=${anno.id} type=${anno.type}${attached}${text} ` +
          `bbox=(${anno.bbox[0]},${anno.bbox[1]},${anno.bbox[2]},${anno.bbox[3]}) [${anno.provenance.origin}]`,
      );
    }
  }

  if (snapshot.chapters.length) {
    lines.push("", `章节（${snapshot.chapters.length}）：`);
    for (const chapter of snapshot.chapters) {
      const start = chapter.startT !== undefined ? ` startT=${chapter.startT}s` : "";
      lines.push(`- ${chapter.id}「${chapter.title}」order=${chapter.order}${start}`);
    }
  }

  if (snapshot.focus) lines.push("", `当前聚焦：${snapshot.focus}`);

  lines.push(
    "",
    "规则：只能通过 id 增删改；不要照着重画已存在的元素；不要删除 [人改过] / origin=human 的元素，除非用户明确要求。",
  );

  return lines.join("\n");
}

export type MultimodalPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

/**
 * 组装成 OpenAI 兼容的多模态 content。
 * 顺序刻意是「先数据后截图」：模型先拿到可寻址的 id 体系，再用截图对齐视觉意图。
 */
export function toMultimodalContent(
  frozen: FrozenContext,
  userText?: string,
): MultimodalPart[] {
  const parts: MultimodalPart[] = [];

  if (userText) parts.push({ type: "text", text: userText });
  parts.push({ type: "text", text: snapshotToPrompt(frozen.snapshot) });
  if (frozen.screenshot) {
    parts.push({ type: "image_url", image_url: { url: frozen.screenshot } });
  }

  return parts;
}
