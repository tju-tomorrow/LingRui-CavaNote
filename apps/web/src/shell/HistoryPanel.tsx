/**
 * 版本历史（PRD/导出与分发.md §2）
 *
 * 「保存」之前是存了却没地方看、也恢复不了 —— 按钮等于没有。
 * 这里给出：时间 / 来源（手动 or AI 动手前）/ 节点数 / 恢复 / 删除。
 */
import { useState } from "react";
import { listSnapshots, removeSnapshot, restoreSnapshot, type Snapshot } from "./snapshot";
import { toast } from "./actions";

function timeLabel(at: number): string {
  const d = new Date(at);
  return `${d.toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" })} ${d.toLocaleTimeString(
    "zh-CN",
    { hour: "2-digit", minute: "2-digit", second: "2-digit" },
  )}`;
}

export function HistoryPanel({ onClose }: { onClose: () => void }) {
  const [items, setItems] = useState<Snapshot[]>(() => listSnapshots());

  const restore = (snap: Snapshot) => {
    if (!window.confirm(`恢复到 ${timeLabel(snap.at)} 的快照？当前状态可以用 ⌘Z 撤回。`)) return;
    restoreSnapshot(snap);
    toast("已恢复（⌘Z 可撤回）");
    onClose();
  };

  const drop = (snap: Snapshot) => {
    removeSnapshot(snap.at);
    setItems(listSnapshots());
  };

  return (
    <div className="lr-modal" role="dialog" aria-modal="true" aria-label="版本历史">
      <div className="lr-modal-backdrop" onClick={onClose} />
      <div className="lr-modal-card lr-history">
        <h3>版本历史</h3>
        <p className="lr-modal-hint">
          手动保存的点永久保留；标「AI 前」的是每轮 AI 动手前自动打的，用于回到改动之前。
        </p>

        {items.length === 0 ? (
          <p className="view-empty">还没有快照。按 ⌘S 或顶栏「保存」打一个点。</p>
        ) : (
          <ul className="history-list">
            {items.map((snap) => (
              <li key={snap.at}>
                <span className={`history-badge${snap.reason === "auto" ? " is-auto" : ""}`}>
                  {snap.reason === "auto" ? "AI 前" : "手动"}
                </span>
                <span className="history-time">{timeLabel(snap.at)}</span>
                <span className="history-meta">
                  {snap.nodes.length} 节点
                  {snap.label ? ` · ${snap.label}` : ""}
                </span>
                <button type="button" className="view-chip" onClick={() => restore(snap)}>
                  恢复
                </button>
                <button type="button" className="nd-del" title="删除" onClick={() => drop(snap)}>
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="lr-modal-actions">
          <button type="button" className="lr-btn-ghost" onClick={onClose}>
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}
