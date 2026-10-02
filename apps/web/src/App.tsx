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
import { MxStage } from "./canvas/MxStage";
import { GhostOverlay } from "./canvas/GhostOverlay";
import { SpotlightOverlay } from "./canvas/SpotlightOverlay";
import { FlowOverlay } from "./canvas/FlowOverlay";
import { EmphasisOverlay } from "./canvas/EmphasisOverlay";
import { revealNode } from "./editor/bridge";
import { PetLayer } from "./pet/PetLayer";
import { TimelineBar } from "./timeline/TimelineBar";
import { SubtitleBar } from "./timeline/SubtitleBar";
import { hydrateTimeline } from "./chat/agent";
import { ShortcutsOverlay } from "./shell/ShortcutsOverlay";
import { isTypingTarget } from "./shell/shortcuts";
import { toast } from "./shell/actions";
import { saveSnapshot } from "./shell/snapshot";
import { redoRound, undoRound } from "./state/history";
import { player } from "./state/player";
import { useFocus } from "./state/focus";
import { setView as setShellView, useView, type ShellView } from "./state/view";
import { setCanvasOpen, setChatOpen, toggleCanvas, toggleChat, useCanvasOpen } from "./state/layout";
import { useActiveCanvas } from "./state/canvas";
import { useActiveNote, setActiveNote } from "./state/notes";
import { useKnowledgeNotes } from "./collab/useKnowledge";
import { useAuth } from "./auth/store";
import { DEFAULT_NOTE_ID, isOpenableNote, reconnectCollab, seeded } from "./collab/doc";
import { TopBar } from "./shell/TopBar";
import { IconRail } from "./shell/IconRail";
import { IconPanel } from "./shell/icons";
import { NoteTree } from "./shell/NoteTree";
import { KnowledgeView } from "./shell/KnowledgeView";
import { TagsView } from "./shell/TagsView";
import { ProjectsView } from "./shell/ProjectsView";
import { SettingsView } from "./shell/SettingsView";
import { DocHeader } from "./shell/DocHeader";
import { CommandPalette } from "./shell/CommandPalette";
import { NodeDetailCard } from "./canvas/NodeDetailCard";
import { CanvasHint } from "./shell/CanvasHint";
import { Onboarding } from "./shell/Onboarding";
import { ChatDock } from "./shell/ChatDock";
import { FindBar } from "./editor/FindBar";
import { Splitter } from "./shell/Splitter";
import { useReadOnlyShare } from "./shell/share";
import "./shell/shell.css";

export function App(): JSX.Element {
  const focus = useFocus();
  const auth = useAuth();
  const notes = useKnowledgeNotes();
  const activeNoteId = useActiveNote();
  const view = useView();
  const canvasOpen = useCanvasOpen();
  const activeCanvasId = useActiveCanvas();
  const [present, setPresent] = useState(false);
  const [palette, setPalette] = useState(false);
  const [help, setHelp] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
  const [findTick, setFindTick] = useState(0);
  /** 本地库是否已加载完 —— 用来区分「刚启动还没读到」与「真的什么都没有」 */
  const [ready, setReady] = useState(false);
  const readOnly = useReadOnlyShare();

  // 演出必须能演，所以演示模式强制显示画布；其余情况听布局状态
  const showCanvas = canvasOpen || present;

  // 画布选中节点 → 文档滚到对应的知识卡片
  // （收起状态下聚焦节点会自动展开画布，见 state/focus.setFocus）
  useEffect(() => {
    if (focus) revealNode(focus);
  }, [focus]);

  // 登录 / 登出后带新 token 重新握手（不重建 provider，本地 Y.Doc 不动）
  useEffect(() => {
    reconnectCollab();
  }, [auth.token]);

  // 演出是持久化的、且**按画布隔离**：切画布 / 启动时恢复该画布的动作流
  useEffect(() => {
    void seeded.then(() => {
      hydrateTimeline(activeCanvasId);
      setReady(true);
    });
  }, [activeCanvasId]);

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

  // 什么都没的时候（且本地库已加载完）→ 空状态先让用户「从一个主题开始」
  const showOnboarding = ready && !notes.some(isOpenableNote);

  // ⌘K / Ctrl+K 打开命令面板；Esc 退出面板与演示
  // 全局键位（清单见 shell/shortcuts.ts，⌘/ 里有同样的表）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();

      // 输入中：只保留「查找」「搜」「帮助」「画布」「AI」「退出」这几个不干扰打字的
      if (isTypingTarget(e.target)) {
        if (mod && key === "\\") {
          e.preventDefault();
          toggleCanvas();
        } else if (mod && key === "f") {
          // 正在正文里打字时 ⌘F 最常用：打开并聚焦查找框
          e.preventDefault();
          setFindOpen(true);
          setFindTick((t) => t + 1);
        } else if (mod && key === "k") {
          e.preventDefault();
          setPalette((v) => !v);
        } else if (mod && e.key === "/") {
          e.preventDefault();
          setHelp((v) => !v);
        } else if (mod && key === "j") {
          e.preventDefault();
          toggleChat();
        } else if (e.key === "Escape") {
          setPalette(false);
          setHelp(false);
          setFindOpen(false);
        }
        return;
      }

      if (mod && key === "\\") {
        e.preventDefault();
        toggleCanvas();
        return;
      }
      if (mod && key === "f") {
        // 笔记内查找：已开着就重新聚焦（不关），否则打开
        e.preventDefault();
        setFindOpen(true);
        setFindTick((t) => t + 1);
        return;
      }
      if (mod && key === "k") {
        e.preventDefault();
        setPalette((v) => !v);
        return;
      }
      if (mod && e.key === "/") {
        e.preventDefault();
        setHelp((v) => !v);
        return;
      }
      if (mod && key === "s") {
        e.preventDefault();
        saveSnapshot();
        toast("已保存快照（⌘S）");
        return;
      }
      if (mod && key === "j") {
        e.preventDefault();
        toggleChat();
        return;
      }
      if (mod && key === "z") {
        e.preventDefault();
        if (e.shiftKey) redoRound();
        else undoRound();
        return;
      }

      // 下面这些不带修饰键
      if (e.key === "Escape") {
        setPalette(false);
        setHelp(false);
        setPresent(false);
        setFindOpen(false);
        return;
      }
      if (e.key === " ") {
        // 空格：播放 / 暂停。别让页面滚动
        e.preventDefault();
        player.toggle();
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        player.nextShot();
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        player.prevShot();
        return;
      }
      // 1–5 切视图
      const views: ShellView[] = ["notes", "knowledge", "projects", "tags", "settings"];
      const index = Number(e.key) - 1;
      if (!mod && Number.isInteger(index) && index >= 0 && index < views.length) {
        setShellView(views[index]!);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className={`app lr${present ? " present" : ""}${showCanvas ? " canvas-open" : " canvas-closed"}`}>
      <TopBar
        onOpenSearch={() => setPalette(true)}
        onOpenAi={() => setChatOpen(true)}
        onPresent={() => setPresent((v) => !v)}
        onToggleCanvas={toggleCanvas}
        present={present}
        canvasOpen={canvasOpen}
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
        {/* 常驻 AI 助手：对齐 PRD/主界面.png 的侧栏底部 */}
        <ChatDock />
      </aside>

      <main className="workspace">
        {showOnboarding ? <Onboarding /> : null}
        {!showOnboarding ? (
          <>
            {activeNote ? <DocHeader note={activeNote} /> : null}

            <section className="pane doc-pane">
              <div className="pane-head">文档</div>
              {findOpen && activeNote ? (
                <FindBar note={activeNote} focusKey={findTick} onClose={() => setFindOpen(false)} />
              ) : null}
              {/* key：换笔记必须重建编辑器（BlockNote 的 collaboration fragment 创建时绑定） */}
              {activeNote ? <NoteEditor key={activeNote.id} note={activeNote} /> : null}
            </section>

            {showCanvas ? (
              <>
                <Splitter />

                <section className="pane canvas">
                  <MxStage />
                  <CanvasHint />
                  {/* 演出：当前讲的节点亮起、其余压暗 */}
                  <SpotlightOverlay />
                  {/* 数据流粒子：沿连线跑的数据包 */}
                  <FlowOverlay />
                  {/* 手绘强调：Agent 圈重点（rough.js） */}
                  <EmphasisOverlay />
                  {/* 三级保险：把待确认的破坏类补丁在画布上就地标出来 */}
                  <GhostOverlay />
                  {/* 大字旁白（顺带驱动 TTS） */}
                  <SubtitleBar />
                  <NodeDetailCard />
                </section>

                <TimelineBar />
              </>
            ) : null}
          </>
        ) : null}
      </main>

      {/* 画布收起时，右缘留一个把手 —— 不然用户不知道画布去哪了 */}
      {!showCanvas && !showOnboarding ? (
        <button
          className="canvas-tab"
          type="button"
          title="展开画布（⌘\\）"
          onClick={() => setCanvasOpen(true)}
        >
          <IconPanel size={15} />
          <span>画布</span>
        </button>
      ) : null}

      {palette ? <CommandPalette onClose={() => setPalette(false)} /> : null}
      {help ? <ShortcutsOverlay onClose={() => setHelp(false)} /> : null}
      {readOnly ? <div className="readonly-banner">只读分享视图（本地演示）</div> : null}

      {/* 演示模式是全屏的（顶栏/侧栏都隐藏）—— 必须给一个看得见的出口，
          否则用户不知道按什么才能回来（Esc 不显眼）。 */}
      {present ? (
        <button className="present-exit" type="button" onClick={() => setPresent(false)}>
          退出演示
          <kbd>Esc</kbd>
        </button>
      ) : null}

      <PetLayer />
    </div>
  );
}
