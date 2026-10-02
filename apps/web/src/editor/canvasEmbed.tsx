/**
 * 概念画布嵌入块 —— 笔记系统里的「一张概念图」
 *
 * 块只存 `props.canvasId`，标题 / 节点数实时从 Y.Doc 读（和知识卡片同一套路）。
 * 点标题 = 把右侧画布切到这张概念画布，并展开画布面板。
 *
 * 交互：
 *   - 用 `/` 插入时，斜杠菜单会先建好画布再插块（见 NoteEditor）；
 *     万一 canvasId 为空，这里也会兜底新建一张，绝不出现「孤儿块」。
 *   - 块上可直接**重命名 / 删除**（删除时若画布是空的，连画布实体一起清掉）。
 *
 * 于是一篇笔记里可以有多张概念图：**笔记是目录，画布是每个概念的可视化与演出**。
 */
import { useEffect, useState } from "react";
import { createReactBlockSpec } from "@blocknote/react";
import { createCanvas, deleteCanvas, renameCanvas } from "@lingrui/knowledge";
import { useCanvasMeta } from "../collab/useKnowledge";
import { ydoc } from "../collab/doc";
import { getActiveNote } from "../state/notes";
import { setActiveCanvas, useActiveCanvas } from "../state/canvas";
import { setCanvasOpen } from "../state/layout";

export const canvasEmbed = createReactBlockSpec(
  {
    type: "canvasEmbed",
    propSchema: {
      canvasId: { default: "" },
    },
    content: "none",
  },
  {
    render: ({ block, editor }) => {
      const canvasId = block.props.canvasId;
      const canvas = useCanvasMeta(canvasId || null);
      const active = useActiveCanvas();
      const [editing, setEditing] = useState(false);
      const [draft, setDraft] = useState("");

      // 兜底：canvasId 为空（非斜杠菜单路径插入）→ 立刻建一张，避免孤儿块
      useEffect(() => {
        if (canvasId) return;
        const created = createCanvas(ydoc, "概念画布", getActiveNote() ?? undefined);
        editor.updateBlock(block, { props: { canvasId: created.id } });
      }, [canvasId, block, editor]);

      if (!canvas) return null; // 正在创建

      const open = () => {
        setActiveCanvas(canvasId);
        setCanvasOpen(true);
      };

      const remove = () => {
        if (canvas.nodeIds.length > 0 && !window.confirm(`删除画布「${canvas.title}」？`)) return;
        editor.removeBlocks([block.id]);
        // 空画布连实体一起清掉，不留残留
        if (canvas.nodeIds.length === 0) deleteCanvas(ydoc, canvasId);
        if (active === canvasId) setActiveCanvas(null);
      };

      const commitRename = () => {
        setEditing(false);
        const value = draft.trim();
        if (value && value !== canvas.title) renameCanvas(ydoc, canvasId, value);
      };

      return (
        <div
          className={`canvas-embed${active === canvasId ? " is-active" : ""}`}
          contentEditable={false}
        >
          <span className="ce-badge">概念画布</span>

          {editing ? (
            <input
              className="ce-rename"
              autoFocus
              value={draft}
              aria-label="重命名画布"
              onFocus={(e) => e.currentTarget.select()}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
                if (e.key === "Escape") setEditing(false);
              }}
            />
          ) : (
            <button type="button" className="ce-title" title="打开这张画布" onClick={open}>
              {canvas.title}
            </button>
          )}

          <span className="ce-count">{canvas.nodeIds.length} 个节点</span>

          <span className="ce-actions">
            <button
              type="button"
              title="重命名"
              onClick={() => {
                setDraft(canvas.title);
                setEditing(true);
              }}
            >
              ✎
            </button>
            <button type="button" title="删除" onClick={remove}>
              ✕
            </button>
          </span>

          <span className="ce-open">{active === canvasId ? "已打开" : "点击打开"}</span>
        </div>
      );
    },
  },
);
