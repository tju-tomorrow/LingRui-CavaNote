/**
 * LingRui Scribe — App Shell
 *
 * 布局对应 PRD/主界面.png：
 *   ┌──────────────────────────────────────────┐
 *   │ topbar   搜索 / 导出 / 分享 / 用户        │
 *   ├────────┬─────────────────────────────────┤
 *   │ 笔记树 │ 画布（Excalidraw + PixiJS 覆盖）│
 *   │ AI助手 ├─────────────────────────────────┤
 *   │        │ 时间轴 播放/暂停/快进 + 缩略图    │
 *   └────────┴─────────────────────────────────┘
 *
 * P0 阶段接入点（按顺序）：
 *   1. <CanvasStage/>  ← @excalidraw/excalidraw（packages/vendor/excalidraw）
 *   2. <ChatPanel/>    ← @assistant-ui/react（packages/vendor/assistant-ui）
 *   3. <NotePanel/>    ← @blocknote/react（packages/vendor/blocknote）
 *   4. Y.Doc           ← @lingrui/knowledge + HocuspocusProvider
 */
import type { JSX } from "react";

export function App(): JSX.Element {
  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">LingRui</span>
        <div className="search">搜索笔记、知识、标签…</div>
      </header>

      <aside className="sidebar">
        <nav className="tree">
          {/* TODO(P0): 由 packages/knowledge 的 Y.Doc 驱动 */}
          <div>笔记</div>
          <div style={{ paddingLeft: 12, color: "var(--muted)" }}>AI 基础与架构</div>
          <div style={{ paddingLeft: 24 }}>一次请求的完整旅程</div>
          <div style={{ paddingLeft: 24, color: "var(--muted)" }}>网关的作用与实现原理</div>
        </nav>

        <section className="chat">
          {/* TODO(P0): assistant-ui Thread + AI SDK useChat */}
          <div style={{ color: "var(--muted)" }}>
            你可以点击画布中的节点，我会为你生成详细的解释笔记。
          </div>
          <input className="chat-input" placeholder="向 LingRui 询问关于这个知识点…" />
        </section>
      </aside>

      <main className="main">
        <section className="canvas">
          {/* TODO(P0): <Excalidraw/> 底层 + <PixiOverlay/> 实时层 + <VrmMascot/> */}
          <div className="canvas-placeholder">
            画布层
            <br />
            Excalidraw（手绘皮肤） + PixiJS（实时数据流） + VRM（吉祥物）
          </div>
        </section>

        <footer className="timeline">
          {/* TODO(P2): packages/anim 的 sampleAt(script, t) 驱动 */}
          <span>▶</span>
          <span>⏸</span>
          <span>00:08 / 01:42</span>
          <div className="track">
            <i />
          </div>
          <span>1.0x</span>
          <span>重播</span>
        </footer>
      </main>
    </div>
  );
}
