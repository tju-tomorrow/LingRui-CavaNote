/**
 * 主题（亮 / 暗）
 *
 * 之前 TopBar 和 SettingsView 各写了一遍 `THEME_KEY` 与写 DOM 的逻辑 ——
 * 同一件事两套实现，改一处忘一处。收到这里，两边都用。
 */
import { useEffect, useState } from "react";

export type Theme = "light" | "dark";

const THEME_KEY = "lingrui-theme";

export function getTheme(): Theme {
  try {
    return localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

export function applyTheme(theme: Theme): void {
  if (typeof document !== "undefined") {
    document.documentElement.dataset["theme"] = theme;
  }
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* 隐私模式：忽略 */
  }
}

/** 读写主题：挂载时同步一次到 DOM，切换时写回 */
export function useTheme(): [Theme, (next: Theme) => void] {
  const [theme, setTheme] = useState<Theme>(getTheme);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  return [theme, setTheme];
}
