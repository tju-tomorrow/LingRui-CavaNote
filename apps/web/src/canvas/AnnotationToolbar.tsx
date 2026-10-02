/**
 * 画布注释工具栏（PRD/主界面.md §2.6「自由手绘 / 注释」）
 *
 * 换成 maxGraph 后这条链路一度断掉；这里把「用户能画能注」接回来。
 * 工具只负责产生 Annotation（写进 Y.Doc），渲染完全由 GraphEngine 派生。
 */
import type { JSX } from "react";

export type AnnotationTool =
  | "select"
  | "node"
  | "connect"
  | "pan"
  | "sticky"
  | "text"
  | "highlight"
  | "shape"
  | "arrow"
  | "draw";

const TOOLS: Array<{ id: AnnotationTool; label: string; title: string }> = [
  { id: "select", label: "↖", title: "选择 / 移动" },
  { id: "pan", label: "✋", title: "抓手（拖动平移画布；滚轮=平移，⌘/Ctrl+滚轮=缩放，双击空白处复位）" },
  { id: "node", label: "＋", title: "新建节点（选形状后点画布）" },
  { id: "connect", label: "⤳", title: "连线（从一个节点拖到另一个）" },
  { id: "sticky", label: "▤", title: "便签" },
  { id: "text", label: "T", title: "文本" },
  { id: "highlight", label: "▭", title: "高亮" },
  { id: "shape", label: "▢", title: "形状" },
  { id: "arrow", label: "→", title: "箭头" },
  { id: "draw", label: "✎", title: "自由手绘" },
];

export function AnnotationToolbar({
  tool,
  onTool,
  disabled,
}: {
  tool: AnnotationTool;
  onTool: (tool: AnnotationTool) => void;
  disabled?: boolean;
}): JSX.Element {
  return (
    <div className="anno-toolbar" role="toolbar" aria-label="画布注释工具">
      {TOOLS.map((item) => (
        <button
          key={item.id}
          type="button"
          className={`anno-tool${tool === item.id ? " is-active" : ""}`}
          title={item.title}
          aria-label={item.title}
          aria-pressed={tool === item.id}
          disabled={disabled}
          onClick={() => onTool(item.id)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
