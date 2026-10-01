/**
 * 画布首屏提示（PRD/演出层 —— 首屏体验）
 *
 * 知识种子是异步写入的（`localPersistence.whenSynced` 之后，或从协同服务同步而来），
 * 在节点到达前画布是空的、看起来像"坏了"。这里给一句提示，节点一到就消失。
 */
import { useKnowledgeNodes } from "../collab/useKnowledge";

export function CanvasHint() {
  const nodes = useKnowledgeNodes();
  if (nodes.length > 0) return null;
  return <div className="canvas-loading">正在加载知识画布…</div>;
}
