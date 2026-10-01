/**
 * 左侧图标导航（PRD/主界面.md §2.2）
 *
 * 五个视图都是真的：笔记 / 知识库 / 项目 / 标签 / 设置。
 * 图标用统一的 SVG 线性图标（shell/icons.tsx），不再是 unicode 字形。
 */
import type { JSX } from "react";
import type { ShellView } from "../state/view";
import {
  IconKnowledge,
  IconNotes,
  IconProjects,
  IconSettings,
  IconTags,
} from "./icons";

export type { ShellView };

type IconComp = (p: { size?: number }) => JSX.Element;

const ITEMS: Array<{ id: ShellView; Icon: IconComp; label: string }> = [
  { id: "notes", Icon: IconNotes, label: "笔记" },
  { id: "knowledge", Icon: IconKnowledge, label: "知识库" },
  { id: "projects", Icon: IconProjects, label: "项目" },
  { id: "tags", Icon: IconTags, label: "标签" },
  { id: "settings", Icon: IconSettings, label: "设置" },
];

export function IconRail({
  view,
  onView,
}: {
  view: ShellView;
  onView: (v: ShellView) => void;
}): JSX.Element {
  return (
    <nav className="rail">
      {ITEMS.map(({ id, Icon, label }) => (
        <button
          key={id}
          type="button"
          className={`rail-item${view === id ? " active" : ""}`}
          title={label}
          onClick={() => onView(id)}
        >
          <span className="rail-icon">
            <Icon size={19} />
          </span>
          <span className="rail-label">{label}</span>
        </button>
      ))}
    </nav>
  );
}
