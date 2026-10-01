/**
 * 左侧图标导航（PRD/主界面.md §2.2）
 *
 * 只有「笔记」有内容；其余为 P1.5 占位视图。
 */
export type ShellView = "notes" | "knowledge" | "projects" | "tags" | "settings";

const ITEMS: Array<{ id: ShellView; icon: string; label: string }> = [
  { id: "notes", icon: "▤", label: "笔记" },
  { id: "knowledge", icon: "◈", label: "知识库" },
  { id: "projects", icon: "▣", label: "项目" },
  { id: "tags", icon: "◉", label: "标签" },
  { id: "settings", icon: "⚙", label: "设置" },
];

export function IconRail({
  view,
  onView,
}: {
  view: ShellView;
  onView: (v: ShellView) => void;
}) {
  return (
    <nav className="rail">
      {ITEMS.map((it) => (
        <button
          key={it.id}
          type="button"
          className={`rail-item${view === it.id ? " active" : ""}`}
          title={it.label}
          onClick={() => onView(it.id)}
        >
          <span className="rail-icon">{it.icon}</span>
          <span className="rail-label">{it.label}</span>
        </button>
      ))}
    </nav>
  );
}
