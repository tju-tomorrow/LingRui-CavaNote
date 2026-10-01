/**
 * 笔记树（PRD/主界面.md §2.3）
 *
 * 「知识节点」列表**从 Y.Doc 派生**（不是硬编码）；点击 = 聚焦该节点
 * （画布高亮 + 文档滚动 + 详情卡弹出）。
 */
import { useKnowledgeNodes } from "../collab/useKnowledge";
import { setFocus, useFocus } from "../state/focus";

export function NoteTree() {
  const nodes = useKnowledgeNodes();
  const focus = useFocus();

  return (
    <nav className="tree">
      <div className="tree-head">
        <span>笔记</span>
        <span className="tree-actions">
          <button type="button" title="新建（P1.5）" disabled>
            ＋
          </button>
          <button type="button" title="更多（P1.5）" disabled>
            …
          </button>
        </span>
      </div>

      <div className="tree-group">AI 基础与架构</div>
      <div className="tree-item active" style={{ paddingLeft: 18 }}>
        一次请求的完整旅程
      </div>

      <div className="tree-group">知识节点（{nodes.length}）</div>
      {nodes.map((n) => (
        <button
          key={n.id}
          type="button"
          className={`tree-node${focus === n.id ? " active" : ""}`}
          style={{ paddingLeft: 18 }}
          onClick={() => setFocus(n.id)}
          title={n.summary ?? n.title}
        >
          <span className={`tree-dot kind-${n.kind}`} />
          <span>{n.title}</span>
        </button>
      ))}
    </nav>
  );
}
