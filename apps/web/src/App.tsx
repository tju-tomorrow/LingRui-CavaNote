/**
 * LingRui CavaNote — App Shell
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
import { SpotlightOverlay } from "./canvas/SpotlightOverlay";
import { ChatPanel } from "./chat/ChatPanel";
import { revealNode } from "./editor/bridge";
import { PetLayer } from "./pet/PetLayer";
import { TimelineBar } from "./timeline/TimelineBar";
import { SubtitleBar } from "./timeline/SubtitleBar";
import { hydrateTimeline } from "./chat/agent";
import { useFocus } from "./state/focus";
import { setView as setShellView, useView } from "./state/view";
import { useActiveNote, setActiveNote } from "./state/notes";
import { useKnowledgeNotes } from "./collab/useKnowledge";
import { useAuth } from "./auth/store";
import { DEFAULT_NOTE_ID, isOpenableNote, reconnectCollab, seeded } from "./collab/doc";
import { TopBar } from "./shell/TopBar";
import { IconRail } from "./shell/IconRail";
import { NoteTree } from "./shell/NoteTree";
import { KnowledgeView } from "./shell/KnowledgeView";
import { TagsView } from "./shell/TagsView";
import { ProjectsView } from "./shell/ProjectsView";
import { SettingsView } from "./shell/SettingsView";
import { DocHeader } from "./shell/DocHeader";
import { CommandPalette } from "./shell/CommandPalette";
import { NodeDetailCard } from "./canvas/NodeDetailCard";
import { CanvasHint } from "./shell/CanvasHint";
import { Splitter } from "./shell/Splitter";
import { useReadOnlyShare } from "./shell/share";
import "./shell/shell.css";

export function App(): JSX.Element {
  const focus = useFocus();
  const auth = useAuth();
  const notes = useKnowledgeNotes();
  const activeNoteId = useActiveNote();
  const view = useView();
  const [present, setPresent] = useState(false);
  const [palette, setPalette] = useState(false);
  const readOnly = useReadOnlyShare();

  // 画布选中节点 → 文档滚到对应的知识卡片
  useEffect(() => {
    if (focus) revealNode(focus);
  }, [focus]);

  // 登录 / 登出后带新 token 重新握手（不重建 provider，本地 Y.Doc 不动）
  useEffect(() => {
    reconnectCollab();
  }, [auth.token]);

  // 演出是持久化的：启动时把上一轮的动作用恢复出来，
  // 否则刷新后 chapters / 缩略图都在、偏偏演不了
  useEffect(() => {
    void seeded.then(() => hydrateTimeline());
  }, []);

  // 笔记列表就绪后选中一篇（老数据认领为「默认笔记」）。
  // 只考虑**真笔记**：分组没有正文，选它会把编辑器绑到空 fragment 上。
  useEffect(() => {
    if (isOpenableNote(notes.find((n) => n.id === activeNoteId))) return;
    void seeded.then(() => {
      const next =
        notes.find((n) => n.id === DEFAULT_NOTE_ID && isOpenableNote(n)) ??
        notes.find(isOpenableNote);
      if (next) setActiveNote(next.id);
    });
  }, [notes, activeNoteId]);

  const activeNote =
    (isOpenableNote(notes.find((n) => n.id === activeNoteId))
      ? notes.find((n) => n.id === activeNoteId)
      : undefined) ??
    notes.find((n) => n.id === DEFAULT_NOTE_ID && isOpenableNote(n)) ??
    notes.find(isOpenableNote);

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

      <IconRail view={view} onView={setShellView} />

      <aside className="sidebar">
        {view === "notes" ? (
          <NoteTree />
        ) : (
          <div className="view-host">
            {view === "knowledge" ? <KnowledgeView /> : null}
            {view === "projects" ? <ProjectsView /> : null}
            {view === "tags" ? <TagsView /> : null}
            {view === "settings" ? <SettingsView /> : null}
          </div>
        )}

        <section className="chat">
          <ChatPanel />
        </section>
      </aside>

      <main className="workspace">
        {activeNote ? <DocHeader note={activeNote} /> : null}

        <section className="pane doc-pane">
          <div className="pane-head">文档视图 · {activeNote?.title ?? "BlockNote"}</div>
          {/* key：换笔记必须重建编辑器（BlockNote 的 collaboration fragment 创建时绑定） */}
          {activeNote ? <NoteEditor key={activeNote.id} note={activeNote} /> : null}
        </section>

        <Splitter />

        <section className="pane canvas">
          <CanvasStage />
          <CanvasHint />
          {/* 演出：当前讲的节点亮起、其余压暗 */}
          <SpotlightOverlay />
          {/* 三级保险：把待确认的破坏类补丁在画布上就地标出来 */}
          <GhostOverlay />
          {/* 大字旁白（顺带驱动 TTS） */}
          <SubtitleBar />
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
