/**
 * 主标题区（PRD/主界面.md §2.5）
 *
 * 标题 / 元信息 / 导出 / 分享 / 保存。导出=Markdown，分享=复制只读链接，
 * 保存=打一个版本快照（显示最近保存时间）。
 */
import { useDocumentActions } from "./actions";

export function DocHeader() {
  const { exportDoc, save, share, savedLabel } = useDocumentActions();

  return (
    <div className="doc-header">
      <div>
        <h1 className="doc-title">一次请求的完整旅程</h1>
        <div className="doc-meta">AI 基础与架构 · 2025-04-25 · 8 分钟阅读</div>
      </div>
      <div className="doc-actions">
        <button className="dh-btn" type="button" disabled title="更多">
          …
        </button>
        <button className="dh-btn" type="button" onClick={() => void exportDoc()} title="导出 Markdown">
          导出
        </button>
        <button className="dh-btn" type="button" onClick={() => void share()} title="复制分享链接">
          分享
        </button>
        <button className="dh-btn primary" type="button" onClick={save} title="打一个版本快照">
          {savedLabel}
        </button>
      </div>
    </div>
  );
}
