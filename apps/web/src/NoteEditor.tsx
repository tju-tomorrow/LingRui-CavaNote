/**
 * 文档视图 —— BlockNote，绑定到全应用同一份 Y.Doc
 *
 * 关键约定（docs/architecture.md §1）：文档块与画布元素共享同一个 Y.Doc，
 * 块只持有 nodeId，正文存在 Y.Doc 里。
 *
 * ⚠️ 坑（踩过，都记进 ADR-0009）：
 *
 * 1. BlockNote 0.55 **只传 `collaboration` 是静默无效的**，必须用
 *    `withCollaboration()` 包装 options 才会注册协作扩展。症状极具迷惑性：
 *    编辑器照常工作（内容来自 initialContent），但
 *    `ydoc.getXmlFragment("document-store").length === 0`——文档**根本没进
 *    Y.Doc、刷新就没了**。
 *
 * 2. `withCollaboration` 会把 `initialContent` 覆盖成一个占位段落（避免各端
 *    随机 id 冲突），而且**就算覆盖回我们自己的 initialContent 也不会被写进
 *    fragment**。原因（读了 y-prosemirror sync-plugin 源码）：挂载时
 *    `_forceRerender()` 先把 PM doc 替换成（空的）fragment 内容，然后
 *    `update` 钩子里 `findDiffStart(空文档, PM doc) === null` → 永远不写回。
 *    之前某次"成功"是 IndexedDB 异步恢复窗口撞上的运气，擦库就露馅。
 *
 *    确定性做法：挂载后检查 fragment 仍为空，就用 `replaceBlocks` 补种——
 *    此刻 PM doc 从空变成有内容，ySync 的 diff 检查才会触发写回。
 *    此路径在空 fragment 上不会踩 restoreRelativeSelection 越界
 *    （那个错误只在"异步恢复旧内容"的竞态里出现）。
 */
import { useEffect } from "react";
import {
  SuggestionMenuController,
  getDefaultReactSlashMenuItems,
  useCreateBlockNote,
  type DefaultReactSuggestionItem,
} from "@blocknote/react";
import { filterSuggestionItems } from "@blocknote/core";
import { withCollaboration } from "@blocknote/core/yjs";
import { zh } from "@blocknote/core/locales";
import { BlockNoteView } from "@blocknote/shadcn";
import "@blocknote/shadcn/style.css";
import { Layers } from "lucide-react";
import { createCanvas } from "@lingrui/knowledge";
import { awareness, blockFragment, DEFAULT_NOTE_ID, ydoc } from "./collab/doc";
import type { NoteMeta } from "@lingrui/knowledge";
import { registerEditor } from "./editor/bridge";
import { schema } from "./editor/schema";
import { isReadOnlyShare } from "./shell/share";
import { setActiveCanvas } from "./state/canvas";
import { setCanvasOpen } from "./state/layout";

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

/**
 * 文档视图。
 *
 * `note` = 当前打开的笔记（PRD/主界面.md §2.3）。每篇笔记的正文各占一个
 * Y.XmlFragment，所以换笔记时必须**重建编辑器** —— 调用方用 `key={note.id}` 做到。
 */
export function NoteEditor({ note }: { note: NoteMeta }) {
  // 分组没有正文：直接给一句提示，不要绑到空名字的 fragment 上（会污染 Y.Doc）
  if (note.isFolder || note.fragment === "") {
    return (
      <div className="editor-host">
        <p className="doc-folder-hint">
          「{note.title}」是分组，没有正文。
          <br />
          在左边的树里展开它，或点它旁边的 ＋ 新建一篇笔记。
        </p>
      </div>
    );
  }
  return <NoteEditorInner note={note} />;
}

function NoteEditorInner({ note }: { note: NoteMeta }) {
  const editor = useCreateBlockNote(
    withCollaboration({
      schema,
      // 中文词典：斜杠菜单 / 占位符 / 空块提示等一律中文（默认是英文）
      dictionary: zh,
      collaboration: {
        fragment: blockFragment(note),
        user: { name: "你", color: "#18181b" },
        ...(awareness ? { provider: { awareness } } : {}),
      },
    }),
    [],
  );

  // 首次打开 / 清库后：fragment 还是空的 → 把种子内容写进去（见文件头注释第 2 条）。
  //
  // 为什么轮询而不是 rAF：编辑器的 Tiptap 视图在 BlockNoteView 内部才挂载，
  // 挂载时的 ySync `_forceRerender` 会把 PM doc 换成（空的）fragment、冲掉过早种的内容。
  // 必须等视图真的挂好了、fragment 依然为空，replaceBlocks 才会触发 diff 写回。
  useEffect(() => {
    const seed = (): boolean => {
      // 只给默认笔记种示例内容；新建的笔记就该是空的
      if (note.id !== DEFAULT_NOTE_ID) return true;
      if (blockFragment(note)._length > 0) return true; // 已有内容（不管是旧的还是别人种的），停
      const doc = editor.document;
      const first = doc[0];
      // 空数组是 truthy 的，所以要显式判断：段落内容必须是不存在 / 空数组才叫空
      const contentIsEmpty =
        first?.content == null ||
        (Array.isArray(first.content) && first.content.length === 0);
      const firstIsEmptyPlaceholder =
        doc.length === 1 && first?.type === "paragraph" && contentIsEmpty;
      if (!firstIsEmptyPlaceholder) return true; // 文档非空但 fragment 空：等 ySync 同步即可
      editor.replaceBlocks(doc, INITIAL_CONTENT);
      return blockFragment(note)._length > 0;
    };

    let tries = 0;
    const timer = window.setInterval(() => {
      tries += 1;
      if (seed() || tries > 30) window.clearInterval(timer);
    }, 120);
    return () => window.clearInterval(timer);
  }, [editor, note]);

  // 把编辑器交给 bridge，聊天/画布才能操作文档
  useEffect(() => {
    registerEditor(editor);
    // 调试：控制台可直接操作编辑器（与 window.__lingrui.ydoc 同级，便于排查文档绑定问题）
    ((window as unknown as { __lingrui?: Record<string, unknown> })["__lingrui"] ??= {})
      .editor = editor;
    return () => {
      registerEditor(null);
      delete (window as unknown as { __lingrui?: Record<string, unknown> })["__lingrui"]
        ?.editor;
    };
  }, [editor]);

  return (
    <div className="editor-host">
      {/* 只读分享视图：文档可读不可改（PRD/导出与分发.md §3） */}
      <BlockNoteView
        editor={editor}
        theme="light"
        editable={!isReadOnlyShare()}
        slashMenu={false}
      >
        {/* 自定义斜杠菜单：默认项 + 「概念画布」（/ 直接建一张画布，不再有孤儿块） */}
        <SuggestionMenuController
          triggerCharacter="/"
          getItems={async (query): Promise<DefaultReactSuggestionItem[]> =>
            filterSuggestionItems(
              [
                ...getDefaultReactSlashMenuItems(editor),
                {
                  title: "概念画布",
                  subtext: "为这个概念开一张画布，点开就切过去",
                  aliases: ["canvas", "画布", "concept"],
                  icon: <Layers size={18} />,
                  onItemClick: () => {
                    const canvas = createCanvas(ydoc, "概念画布", note.id);
                    const current = editor.getTextCursorPosition().block;
                    editor.insertBlocks(
                      [{ type: "canvasEmbed", props: { canvasId: canvas.id } }],
                      current,
                      "after",
                    );
                    setActiveCanvas(canvas.id);
                    setCanvasOpen(true);
                  },
                },
              ],
              query,
            )
          }
        />
      </BlockNoteView>
    </div>
  );
}
