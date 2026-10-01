/**
 * 设置（PRD/主界面.md §5.5）
 *
 * 只做**真的能改**的东西，不放假开关：
 *   - 主题：亮 / 暗（与顶栏那个 ☀ 共用同一份 localStorage）
 *   - 账户：当前登录用户 / 退出
 *   - 协同：连接地址与连接状态（真实读 provider）
 *   - AI：/api/chat 的地址，以及是否被显式关掉
 *   - 本地数据：清掉 IndexedDB 与本地快照（危险操作，二次确认）
 */
import { useEffect, useState } from "react";
import { logout, useAuth } from "../auth/store";
import { CHAT_API, remoteEnabled } from "../chat/remote";
import { remoteProvider } from "../collab/doc";
import { setView } from "../state/view";

const THEME_KEY = "lingrui-theme";
type Theme = "light" | "dark";

function currentTheme(): Theme {
  try {
    return localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

function applyTheme(theme: Theme): void {
  document.documentElement.dataset["theme"] = theme;
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* ignore */
  }
}

export function SettingsView() {
  const auth = useAuth();
  const [theme, setTheme] = useState<Theme>(currentTheme);
  const [collab, setCollab] = useState(() => ({
    url: remoteProvider ? "已配置" : "未配置",
    synced: remoteProvider?.synced ?? false,
  }));

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // 真实读一次协同连接状态（provider 的事件驱动）
  useEffect(() => {
    const p = remoteProvider;
    if (!p) return;
    const update = () =>
      setCollab({
        url: String((p.configuration as { url?: string } | undefined)?.url ?? "已配置"),
        synced: p.synced,
      });
    update();
    p.on("synced", update);
    p.on("status", update);
    return () => {
      p.off("synced", update);
      p.off("status", update);
    };
  }, []);

  const clearLocal = () => {
    if (!window.confirm("清掉本机缓存（IndexedDB + 本地快照）？云端/其它端的数据不受影响。")) return;
    try {
      indexedDB.deleteDatabase("lingrui-demo");
      localStorage.removeItem("lingrui-snapshots");
      localStorage.removeItem("lingrui-tree-collapsed");
    } catch {
      /* ignore */
    }
    window.location.reload();
  };

  return (
    <div className="view-page">
      <header className="view-head">
        <h2>设置</h2>
      </header>

      <section className="settings-block">
        <h3>外观</h3>
        <div className="settings-row">
          <span>主题</span>
          <div className="view-chips">
            <button
              type="button"
              className={`view-chip${theme === "light" ? " active" : ""}`}
              onClick={() => setTheme("light")}
            >
              亮色
            </button>
            <button
              type="button"
              className={`view-chip${theme === "dark" ? " active" : ""}`}
              onClick={() => setTheme("dark")}
            >
              暗色
            </button>
          </div>
        </div>
      </section>

      <section className="settings-block">
        <h3>账户</h3>
        {auth.user ? (
          <div className="settings-row">
            <span>
              {auth.user.name}
              <span className="settings-dim"> · {auth.user.email}</span>
            </span>
            <button type="button" className="view-chip" onClick={logout}>
              退出登录
            </button>
          </div>
        ) : (
          <div className="settings-row">
            <span className="settings-dim">未登录（进度存本机，不跨设备）</span>
          </div>
        )}
      </section>

      <section className="settings-block">
        <h3>协同</h3>
        <div className="settings-row">
          <span>连接</span>
          <span className="settings-dim">
            {collab.url} · {collab.synced ? "已同步" : "未连接"}
          </span>
        </div>
      </section>

      <section className="settings-block">
        <h3>AI</h3>
        <div className="settings-row">
          <span>对话接口</span>
          <span className="settings-dim">
            {CHAT_API}
            {remoteEnabled ? "" : "（已关闭，只用本地讲解器）"}
          </span>
        </div>
      </section>

      <section className="settings-block danger">
        <h3>本地数据</h3>
        <div className="settings-row">
          <span className="settings-dim">清空后本机回到初始状态（需重新从云端同步）</span>
          <button type="button" className="view-chip danger" onClick={clearLocal}>
            清空本机缓存
          </button>
        </div>
      </section>

      <button type="button" className="view-chip" onClick={() => setView("notes")}>
        ← 回到笔记
      </button>
    </div>
  );
}
