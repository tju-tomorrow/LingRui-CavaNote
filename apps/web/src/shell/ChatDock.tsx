/**
 * 侧栏底部的 AI 助手（常驻，PRD/主界面.md §2.4）
 *
 * 之前为给侧栏减负把聊天挪进了 ⌘J 弹窗；但参考图里它是**常驻**在笔记树下方的。
 * 这里改回常驻：固定在侧栏底部、可收起。收起只是把 body `display:none`，
 * ChatPanel 始终挂载 —— 否则一收起对话历史就没了。
 */
import { ChatPanel } from "../chat/ChatPanel";
import { toggleChat, useChatOpen } from "../state/layout";
import { IconChevronDown, IconSparkle } from "./icons";

export function ChatDock() {
  const open = useChatOpen();
  return (
    <section className={`chat-dock${open ? " open" : ""}`} aria-label="AI 助手">
      <button type="button" className="chat-dock-head" aria-expanded={open} onClick={toggleChat}>
        <IconSparkle size={14} />
        <span className="chat-dock-title">AI 助手</span>
        <span className={`chat-dock-chev${open ? " open" : ""}`}>
          <IconChevronDown size={14} />
        </span>
      </button>
      <div className="chat-dock-body">
        <div className="chat chat-dock-chat">
          <ChatPanel />
        </div>
      </div>
    </section>
  );
}
