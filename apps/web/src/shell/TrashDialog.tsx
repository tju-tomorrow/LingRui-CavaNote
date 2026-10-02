/**
 * 回收站（笔记生命周期）
 *
 * 删除 = 打 `trashedAt`（软删除，Yjs 墓碑可恢复），这里统一「恢复 / 彻底删除 / 清空」。
 * 恢复用 `restoreNoteDeep`：整棵子树回来；父级不在时挂回顶层，避免恢复了却看不见。
 *
 * 列表只列「回收站森林」的根（父级也在回收站里的条目跟着根一起显示），
 * 否则删一个分组会刷出一长串同名子项。
 */
import { useMemo, useState } from "react";
import {
  emptyTrash,
  listAllNotes,
  notePath,
  purgeNoteDeep,
  reconcileBlockIds,
  restoreNoteDeep,
  type NoteMeta,
} from "@lingrui/knowledge";
import { ydoc } from "../collab/doc";
import { useTrashedNotes } from "../collab/useKnowledge";
import { setActiveNote } from "../state/notes";
import { toast } from "./actions";

function timeLabel(at?: number): string {
  if (!at) return "";
  const d = new Date(at);
  return `${d.toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" })} ${d.toLocaleTimeString(
    "zh-CN",
    { hour: "2-digit", minute: "2-digit" },
  )}`;
}

/** 回收站里的条目，按「原路径」给个人话 */
function pathLabel(note: NoteMeta): string {
  const parents = notePath(ydoc, note.id).map((n) => n.title);
  return parents.length > 0 ? parents.join(" / ") : "顶层";
}

export function TrashDialog({ onClose }: { onClose: () => void }) {
  const items = useTrashedNotes();
  const [busy, setBusy] = useState(false);

  // 只保留根，避免重复
  const roots = useMemo(() => {
    const trashed = new Set(items.map((n) => n.id));
    return items.filter((n) => !n.parentId || !trashed.has(n.parentId));
  }, [items]);

  const restore = (note: NoteMeta) => {
    restoreNoteDeep(ydoc, note.id);
    if (!note.isFolder) setActiveNote(note.id);
    toast(`已恢复「${note.title}」`);
  };

  /**
   * 彻底删除后清理指向已消失文档块的幽灵引用。
   * 用 listAllNotes：回收站里**还没被彻底删**的笔记正文仍在，不能被误清。
   */
  const reconcile = () => {
    reconcileBlockIds(
      ydoc,
      listAllNotes(ydoc)
        .map((n) => n.fragment)
        .filter(Boolean),
    );
  };

  const purge = (note: NoteMeta) => {
    purgeNoteDeep(ydoc, note.id);
    reconcile();
    toast(`已彻底删除「${note.title}」`);
  };

  const empty = () => {
    if (items.length === 0) return;
    if (!window.confirm(`彻底删除回收站里的 ${items.length} 项？此操作不可撤销。`)) return;
    setBusy(true);
    emptyTrash(ydoc);
    reconcile();
    setBusy(false);
    toast("回收站已清空");
  };

  return (
    <div className="lr-modal" role="dialog" aria-modal="true" aria-label="回收站">
      <div className="lr-modal-backdrop" onClick={onClose} />
      <div className="lr-modal-card lr-trash">
        <h3>回收站</h3>
        <p className="lr-modal-hint">
          删掉的笔记会先到这里，随时可恢复。恢复分组会把它下面的笔记一起带回来。
        </p>

        {roots.length === 0 ? (
          <p className="view-empty">回收站是空的。</p>
        ) : (
          <ul className="trash-list">
            {roots.map((note) => (
              <li key={note.id}>
                <span className="trash-kind">{note.isFolder ? "分组" : "笔记"}</span>
                <span className="trash-main">
                  <span className="trash-title">{note.title}</span>
                  <span className="trash-path">
                    {pathLabel(note)} · 删除于 {timeLabel(note.trashedAt)}
                  </span>
                </span>
                <button type="button" className="view-chip" onClick={() => restore(note)}>
                  恢复
                </button>
                <button
                  type="button"
                  className="nd-del"
                  title="彻底删除（不可恢复）"
                  onClick={() => purge(note)}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="lr-modal-actions">
          <button
            type="button"
            className="lr-btn-ghost"
            onClick={empty}
            disabled={busy || roots.length === 0}
          >
            清空回收站
          </button>
          <button type="button" className="lr-btn-ghost" onClick={onClose}>
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}
