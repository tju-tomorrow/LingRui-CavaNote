/**
 * LingRui Scribe — App Shell
 *
 * 布局对应 PRD/主界面.png：
 *   顶栏 | 左图标栏 | 侧栏（笔记树 + AI 助手）| 主区（标题 + 文档 + 画布 + 时间轴）
 *
 * 接入进度：
 *   ✅ 文档视图  BlockNote（@blocknote/shadcn），绑定 Y.Doc
 *   ✅ 画布视图  Excalidraw，从 Y.Doc 增量派生
 *   ✅ 本地持久化 / 远端协同 / AI 助手 / 时间轴 / 像素宠物
 *   ✓ 主界面壳  顶栏 / 图标导航 / 笔记树 / 主标题区 / ⌘K / 节点详情卡（P1.5）
 */
import type { JSX } from "react";
import { useEffect, useState } from "react";
import { NoteEditor } from "./NoteEditor";
import { CanvasStage } from "./CanvasStage";
import { GhostOverlay } from "./canvas/GhostOverlay";
import { ChatPanel } from "./chat/ChatPanel";
import { revealNode } from "./editor/bridge";
import { PetLayer } from "./pet/PetLayer";
import { TimelineBar } from "./timeline/TimelineBar";
import { useFocus } from "./state/focus";
import { TopBar } from "./shell/TopBar";
import { IconRail, type ShellView } from "./shell/IconRail";
import { NoteTree } from "./shell/NoteTree";
import { DocHeader } from "./shell/DocHeader";
import { CommandPalette } from "./shell/CommandPalette";
import { NodeDetailCard } from "./canvas/NodeDetailCard";
import { isReadOnlyShare } from "./shell/share";
import "./shell/shell.css";

const PLACEHOLDER: Record<Exclude<ShellView, "notes">, string> = {
  knowledge: "知识库：跨笔记的全局节点图谱与索引（P1.5 占位）。",
  projects: "项目：把笔记分组管理（P1.5 占位）。",
  tags: "标签：横切笔记与节点的标签索引（P1.5 占位）。",
  settings: "设置：主题 / 协同 / AI 模型 / 导出偏好（P1.5 占位）。",
};

export function App(): JSX.Element {
  const focus = useFocus();
  const [view, setView] = useState<ShellView>("notes");
  const [present, setPresent] = useState(false);
  const [palette, setPalette] = useState(false);
  const [readOnly] = useState(() => isReadOnlyShare());

  // 画布选中节点 → 文档滚到对应的知识卡片
  useEffect(() => {
    if (focus) revealNode(focus);
  }, [focus]);

  // ⌘K / Ctrl+K 打开命令面板；Esc 退出面板与演示
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((v) => !v);
      } else if (e.key === "Escape") {
        setPalette(false);
        setPresent(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className={`app lr${present ? " present" : ""}`}>
      <TopBar
        onOpenSearch={() => setPalette(true)}
        onPresent={() => setPresent((v) => !v)}
        present={present}
      />

      <IconRail view={view} onView={setView} />

      <aside className="sidebar">
        {view === "notes" ? (
          <NoteTree />
        ) : (
          <div className="view-placeholder">{PLACEHOLDER[view]}</div>
        )}

        <section className="chat">
          <ChatPanel />
        </section>
      </aside>

      <main className="workspace">
        <DocHeader />

        <section className="pane doc-pane">
          <div className="pane-head">文档视图 · BlockNote</div>
          <NoteEditor />
        </section>

        <section className="pane canvas">
          <CanvasStage />
          {/* 三级保险：把待确认的破坏类补丁在画布上就地标出来 */}
          <GhostOverlay />
          <NodeDetailCard />
        </section>

        <TimelineBar />
      </main>

      {palette ? <CommandPalette onClose={() => setPalette(false)} /> : null}
      {readOnly ? <div className="readonly-banner">只读分享视图（本地演示）</div> : null}
      <PetLayer />
    </div>
  );
}
