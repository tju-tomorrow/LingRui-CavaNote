/**
 * LingRui Scribe — App Shell
 *
 * 布局对应 PRD/主界面.png。核心演示点：**左侧文档视图与右侧画布视图共享同一份 Knowledge**。
 *
 * 接入进度：
 *   ✅ 文档视图  BlockNote（@blocknote/shadcn），绑定 Y.Doc
 *   ✅ 画布视图  Excalidraw，从 Y.Doc 派生节点
 *   ✅ 本地持久化 y-indexeddb（刷新不丢）
 *   ✅ 远端协同  HocuspocusProvider（VITE_COLLAB_URL 决定是否启用）
 *   ✅ AI 助手   assistant-ui runtime + 自定义 UI（本地确定性讲解器）
 *   ⬜ 时间轴    @lingrui/anim 的 sampleAt(script, t)
 *   ⬜ 吉祥物    VRM（需要 lingrui.vrm 资产）
 */
import type { JSX } from "react";
import { useEffect } from "react";
import { NoteEditor } from "./NoteEditor";
import { CanvasStage } from "./CanvasStage";
import { ChatPanel } from "./chat/ChatPanel";
import { useKnowledgeNodes } from "./collab/useKnowledge";
import { revealNode } from "./editor/bridge";
import { PetLayer } from "./pet/PetLayer";
import { useFocus } from "./state/focus";

export function App(): JSX.Element {
  const focus = useFocus();
  const nodes = useKnowledgeNodes();
  const focusedTitle = focus ? nodes.find((n) => n.id === focus)?.title : undefined;

  // 两个视图同步：画布上选中节点 → 文档滚到对应的知识卡片
  useEffect(() => {
    if (focus) revealNode(focus);
  }, [focus]);

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">LingRui</span>
        <div className="search">搜索笔记、知识、标签…</div>
        {focusedTitle ? <span className="focus-pill">已聚焦：{focusedTitle}</span> : null}
      </header>

      <aside className="sidebar">
        <nav className="tree">
          <div className="tree-item">笔记</div>
          <div className="tree-item" style={{ paddingLeft: 18 }}>
            AI 基础与架构
          </div>
          <div className="tree-item active" style={{ paddingLeft: 30 }}>
            一次请求的完整旅程
          </div>
          <div className="tree-item" style={{ paddingLeft: 30, color: "var(--muted)" }}>
            网关的作用与实现原理
          </div>
          <div className="tree-item" style={{ paddingLeft: 30, color: "var(--muted)" }}>
            Redis 的应用场景与数据结构
          </div>
        </nav>

        <section className="chat">
          <ChatPanel />
        </section>
      </aside>

      <main className="workspace">
        <section className="pane doc-pane">
          <div className="pane-head">文档视图 · BlockNote</div>
          <NoteEditor />
        </section>

        <section className="pane canvas">
          <CanvasStage />
        </section>

        <footer className="timeline">
          {/* TODO(P2): @lingrui/anim 的 sampleAt(script, t) 驱动 */}
          <span>▶</span>
          <span>⏸</span>
          <span>00:00 / 01:42</span>
          <div className="track">
            <i />
          </div>
          <span>1.0x</span>
          <span>重播</span>
        </footer>
      </main>

      <PetLayer />
    </div>
  );
}
