/**
 * 顶栏（PRD/主界面.md §2.1）
 *
 * 主题切换、▷演示、⌘K 搜索可用；导出/分享为 P4 占位（禁用）。
 */
import { useEffect, useState } from "react";
import { useDocumentActions } from "./actions";

type Theme = "light" | "dark";
const THEME_KEY = "lingrui-theme";

function initialTheme(): Theme {
  const saved = typeof localStorage !== "undefined" ? localStorage.getItem(THEME_KEY) : null;
  return saved === "dark" ? "dark" : "light";
}

export function TopBar({
  onOpenSearch,
  onPresent,
  present,
}: {
  onOpenSearch: () => void;
  onPresent: () => void;
  present: boolean;
}) {
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const { exportDoc, share } = useDocumentActions();

  useEffect(() => {
    document.documentElement.dataset["theme"] = theme;
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  return (
    <header className="topbar tb">
      <span className="brand">LingRui</span>

      <button className="tb-search" type="button" onClick={onOpenSearch}>
        <span>搜索笔记、知识、标签…</span>
        <kbd>⌘K</kbd>
      </button>

      <div className="tb-spacer" />

      <button
        className="tb-icon"
        type="button"
        title={theme === "light" ? "切到暗色" : "切到亮色"}
        onClick={() => setTheme((t) => (t === "light" ? "dark" : "light"))}
      >
        {theme === "light" ? "☀" : "☾"}
      </button>

      <button
        className="tb-icon"
        type="button"
        title={present ? "退出演示" : "进入演示"}
        onClick={onPresent}
      >
        {present ? "◼" : "▷"}
      </button>

      <button className="tb-icon" type="button" title="导出 Markdown" onClick={() => void exportDoc()}>
        ⤴
      </button>
      <button className="tb-icon" type="button" title="复制分享链接" onClick={() => void share()}>
        ↗
      </button>

      <span className="tb-avatar" title="账户">
        陈
      </span>
    </header>
  );
}
