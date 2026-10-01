/**
 * 登录 / 注册对话框（PRD/主界面.md §2.1 的「账户/头像」）
 *
 * 一个弹层两个模式，不引 UI 库 —— 和项目其它部分一样自己写。
 * 登录成功后：token 进 localStorage，协同连接与 /api/chat 都会带上它。
 */
import { useState } from "react";
import { login, register } from "../auth/store";

export function LoginDialog({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if (mode === "login") await login(email, password);
      else await register(email, password, name || undefined);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="lr-modal" role="dialog" aria-modal="true" aria-label="登录">
      <div className="lr-modal-backdrop" onClick={onClose} />
      <form className="lr-modal-card" onSubmit={submit}>
        <h3>{mode === "login" ? "登录" : "注册"}</h3>
        <p className="lr-modal-hint">
          登录后你的进度与宠物是「你自己的」；不登录也能用（本地优先）。
        </p>

        <label className="lr-field">
          <span>邮箱</span>
          <input
            type="email"
            value={email}
            autoComplete="email"
            required
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>

        {mode === "register" ? (
          <label className="lr-field">
            <span>昵称</span>
            <input
              value={name}
              placeholder="可留空"
              autoComplete="nickname"
              onChange={(e) => setName(e.target.value)}
            />
          </label>
        ) : null}

        <label className="lr-field">
          <span>密码</span>
          <input
            type="password"
            value={password}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            required
            minLength={6}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>

        {error ? <p className="lr-modal-error">{error}</p> : null}

        <div className="lr-modal-actions">
          <button
            type="button"
            className="lr-btn-ghost"
            onClick={() => {
              setMode((m) => (m === "login" ? "register" : "login"));
              setError(null);
            }}
          >
            {mode === "login" ? "没有账号？注册" : "已有账号？登录"}
          </button>
          <button type="submit" className="lr-btn-primary" disabled={busy}>
            {busy ? "请稍候…" : mode === "login" ? "登录" : "注册并登录"}
          </button>
        </div>
      </form>
    </div>
  );
}
