/**
 * 文档视图 —— BlockNote，绑定到全应用同一份 Y.Doc
 *
 * 关键约定（docs/architecture.md §1）：文档块与画布元素共享同一个 Y.Doc，
 * 块只持有 nodeId，正文存在 Y.Doc 里。
 *
 * ⚠️ 坑（踩过）：BlockNote 0.55 **只传 `collaboration` 是静默无效的**，
 * 必须用 `withCollaboration()` 包装 options 才会注册协作扩展。
 * 症状极具迷惑性：编辑器照常工作（内容来自 initialContent），
 * 但 `ydoc.getXmlFragment("document-store").length === 0` ——
 * 也就是文档**根本没进 Y.Doc、刷新就没了**。
 * 另外 `withCollaboration` 会把 `initialContent` 覆盖成一个占位段落
 * （避免各端随机 id 冲突），所以种子内容要自己补。
 */
import { useEffect } from "react";
import { useCreateBlockNote } from "@blocknote/react";
import { withCollaboration } from "@blocknote/core/yjs";
import { BlockNoteView } from "@blocknote/shadcn";
import "@blocknote/shadcn/style.css";
import { awareness, blockFragment } from "./collab/doc";
import { registerEditor } from "./editor/bridge";
import { schema } from "./editor/schema";

const INITIAL_CONTENT = [
  { type: "heading" as const, props: { level: 1 as const }, content: "一次请求的完整旅程" },
  {
    type: "paragraph" as const,
    content: "AI 基础与架构 · 用一只吉祥物把这条链路跑一遍，而不是堆文字。",
  },
  { type: "heading" as const, props: { level: 2 as const }, content: "1. 用户发起请求" },
  { type: "paragraph" as const, content: "浏览器通过 HTTP 把请求发给统一入口 —— API 网关。" },
  { type: "heading" as const, props: { level: 2 as const }, content: "2. 网关：统一入口" },
  { type: "bulletListItem" as const, content: "统一入口：所有请求先经过网关" },
  { type: "bulletListItem" as const, content: "鉴权与限流：保障系统安全与稳定" },
  { type: "bulletListItem" as const, content: "路由转发：根据规则转发到后端服务" },
  { type: "heading" as const, props: { level: 2 as const }, content: "3. 后端服务：缓存 / 消息 / 落库" },
  {
    type: "paragraph" as const,
    content: "先查 Redis 缓存（可选），再走业务逻辑，必要时投递到消息队列并写数据库。",
  },
  { type: "heading" as const, props: { level: 2 as const }, content: "4. 涉及的知识节点" },
  // 知识卡片只存 nodeId，标题随 Knowledge 变化而变；点击卡片 = 聚焦该节点
  { type: "knowledgeCard" as const, props: { nodeId: "gateway" } },
  { type: "knowledgeCard" as const, props: { nodeId: "redis" } },
];

export function NoteEditor() {
  const editor = useCreateBlockNote(
    {
      ...withCollaboration({
        schema,
        collaboration: {
          fragment: blockFragment(),
          user: { name: "你", color: "#5b5bd6" },
          ...(awareness ? { provider: { awareness } } : {}),
        },
      }),
      // withCollaboration 会把 initialContent 换成占位段落（避免各端随机 id 冲突），
      // 这里覆盖回来。YSync 只在 fragment 为空时应用它，所以不会覆盖已有内容。
      //
      // 为什么不"挂载后 replaceBlocks 补种"：那会和 Yjs 的同步事务抢时序，
      // 触发 y-prosemirror 的 restoreRelativeSelection 越界（Position out of range）。
      initialContent: INITIAL_CONTENT,
    },
    [],
  );

  // 把编辑器交给 bridge，聊天/画布才能操作文档
  useEffect(() => {
    registerEditor(editor);
    return () => registerEditor(null);
  }, [editor]);

  return (
    <div className="editor-host">
      <BlockNoteView editor={editor} theme="light" />
    </div>
  );
}
