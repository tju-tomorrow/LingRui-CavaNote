/**
 * 快捷键帮助（⌘/）
 *
 * 只列 `shortcuts.ts` 里真的接了的键。顺带把「双击节点」「拖动分隔条」这类
 * 非键盘操作也写进去 —— 用户不会去读文档，只会按 ⌘/。
 */
import { SHORTCUTS } from "./shortcuts";

export function ShortcutsOverlay({ onClose }: { onClose: () => void }) {
  return (
    <div className="lr-modal" role="dialog" aria-modal="true" aria-label="快捷键">
      <div className="lr-modal-backdrop" onClick={onClose} />
      <div className="lr-modal-card lr-shortcuts">
        <h3>快捷键</h3>
        <ul>
          {SHORTCUTS.map((s) => (
            <li key={s.keys}>
              <kbd>{s.keys}</kbd>
              <span>{s.label}</span>
            </li>
          ))}
        </ul>
        <div className="lr-modal-actions">
          <span className="lr-modal-hint">按 ⌘/ 或 Esc 关闭</span>
        </div>
      </div>
    </div>
  );
}
