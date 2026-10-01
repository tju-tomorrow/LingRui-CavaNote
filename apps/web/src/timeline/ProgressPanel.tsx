/**
 * 笔记进度（见 PRD/演出层.md §5、PRD/知识模型.md §2.5）
 *
 * - 时间轴推进到某节点 → 自动标 `learning`（不覆盖已 `done`）
 * - 手动点击 → 在 `done` / `todo` 之间切换
 * - 数据存在 Y.Doc 的 per-user `progress` 桶里
 */
import { useEffect, useState } from "react";
import {
  getProgressRoot,
  listProgress,
  LOCAL_USER,
  readProgress,
  setProgress,
  type NodeProgress,
} from "@lingrui/knowledge";
import { useAuth } from "../auth/store";
import { ydoc } from "../collab/doc";
import { useKnowledgeNodes } from "../collab/useKnowledge";
import { usePlayer } from "../state/player";

function useProgress(userId: string): Record<string, NodeProgress> {
  const [progress, setLocal] = useState(() => listProgress(ydoc, userId));
  useEffect(() => {
    const root = getProgressRoot(ydoc);
    const update = () => setLocal(listProgress(ydoc, userId));
    update();
    root.observe(update);
    return () => root.unobserve(update);
  }, [userId]);
  return progress;
}

const MARK: Record<string, string> = { done: "✓", learning: "◐", todo: "○" };

export function ProgressPanel() {
  const nodes = useKnowledgeNodes();
  const auth = useAuth();
  // 进度是「每个人自己的」（PRD/知识模型.md §2.5）：登录后用真实 userId 分桶，未登录落到 local
  const userId = auth.user?.id ?? LOCAL_USER;
  const progress = useProgress(userId);
  const { snapshot } = usePlayer();
  const focus = snapshot?.focus ?? null;

  // 时间轴推进到某节点 → 自动标 learning（done 不覆盖）
  useEffect(() => {
    if (!focus) return;
    if (readProgress(ydoc, focus, userId)?.state !== "done") {
      setProgress(ydoc, focus, "learning", userId);
    }
  }, [focus, userId]);

  const toggle = (id: string) => {
    const cur = readProgress(ydoc, id, userId)?.state ?? "todo";
    setProgress(ydoc, id, cur === "done" ? "todo" : "done", userId);
  };

  return (
    <div className="tl-progress">
      <div className="tl-progress-head">笔记进度</div>
      <ul className="tl-progress-list">
        {nodes.map((n) => {
          const state = progress[n.id]?.state ?? "todo";
          return (
            <li key={n.id} className={`tl-progress-item${focus === n.id ? " current" : ""}`}>
              <button
                type="button"
                className={`tl-progress-mark st-${state}`}
                onClick={() => toggle(n.id)}
                title="标记完成 / 取消"
              >
                {MARK[state] ?? "○"}
              </button>
              <span className="tl-progress-title">{n.title}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
