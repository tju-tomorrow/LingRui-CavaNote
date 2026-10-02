/**
 * 顶栏（PRD/主界面.md §2.1）
 *
 * 主题切换、▷演示、⌘K 搜索可用；导出/分享为 P4 占位（禁用）。
 */
import { useState } from "react";
import { logout, useAuth } from "../auth/store";
import { useDocumentActions } from "./actions";
import { useTheme } from "./theme";
import { setView } from "../state/view";
import { setTtsEnabled, ttsSupported, useTtsEnabled } from "../timeline/tts";
import { LoginDialog } from "./LoginDialog";
import { ShareDialog } from "./ShareDialog";
import { IconExport, IconMoon, IconPlay, IconShare, IconStop, IconSun } from "./icons";

export function TopBar({
  onOpenSearch,
  onPresent,
  present,
}: {
  onOpenSearch: () => void;
  onPresent: () => void;
  present: boolean;
}) {
  const [theme, setTheme] = useTheme();
  const [accountOpen, setAccountOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { exportDoc, share, shareOpen, closeShare } = useDocumentActions();
  const auth = useAuth();
  const tts = useTtsEnabled();

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
        onClick={() => setTheme(theme === "light" ? "dark" : "light")}
      >
        {theme === "light" ? <IconSun size={17} /> : <IconMoon size={17} />}
      </button>

      {ttsSupported() ? (
        <button
          className={`tb-icon${tts ? " is-on" : ""}`}
          type="button"
          title={tts ? "关闭旁白朗读" : "开启旁白朗读（TTS）"}
          onClick={() => setTtsEnabled(!tts)}
        >
          {tts ? "🔊" : "🔈"}
        </button>
      ) : null}

      <button
        className="tb-icon"
        type="button"
        title={present ? "退出演示" : "进入演示"}
        onClick={onPresent}
      >
        {present ? <IconStop size={17} /> : <IconPlay size={17} />}
      </button>

      <button className="tb-icon" type="button" title="导出 Markdown" onClick={() => void exportDoc()}>
        <IconExport size={17} />
      </button>
      <button className="tb-icon" type="button" title="复制分享链接" onClick={() => void share()}>
        <IconShare size={17} />
      </button>

      {/* 头像点开是**菜单**，不是直接退出 —— 单击就把人登出太危险 */}
      <div className="tb-account">
        <button
          className="tb-avatar"
          type="button"
          title={auth.user ? `${auth.user.name}（${auth.user.email}）` : "登录 / 注册"}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}
        >
          {auth.user ? auth.user.name.slice(0, 1) : "登"}
        </button>

        {menuOpen ? (
          <>
            <div className="tb-menu-backdrop" onClick={() => setMenuOpen(false)} />
            <div className="tb-menu" role="menu">
              {auth.user ? (
                <>
                  <div className="tb-menu-head">
                    <strong>{auth.user.name}</strong>
                    <span>{auth.user.email}</span>
                  </div>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      setView("settings");
                    }}
                  >
                    ⚙ 设置
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      logout();
                    }}
                  >
                    ⏏ 退出登录
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    setAccountOpen(true);
                  }}
                >
                  → 登录 / 注册
                </button>
              )}
            </div>
          </>
        ) : null}
      </div>

      {accountOpen ? <LoginDialog onClose={() => setAccountOpen(false)} /> : null}
      {shareOpen ? <ShareDialog onClose={closeShare} /> : null}
    </header>
  );
}
