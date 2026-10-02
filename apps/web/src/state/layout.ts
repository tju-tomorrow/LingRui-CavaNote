/**
 * 布局状态：画布面板是否展开
 *
 * 产品首先是**笔记系统** —— 笔记永远是主面，画布是按需拉开的辅助面板，
 * 而不是一个常驻的固定分栏。收起状态写 localStorage，刷新后保持。
 *
 * 与 state/view 同构：模块级 store + useSyncExternalStore，
 * 因为顶栏、右缘把手、快捷键都要能改它。
 */
import { useSyncExternalStore } from "react";

const KEY = "lingrui-canvas-open";

function initial(): boolean {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === "0") return false;
    if (saved === "1") return true;
  } catch {
    /* ignore */
  }
  // 桌面端是「画布产品」：启动就直接进画布（npm run desktop 一点即用），
  // 而不是先给一个空的笔记页。web 端仍笔记优先，画布默认收起。
  if (typeof window !== "undefined" && window.lingrui?.isDesktop) return true;
  return false;
}

let open = initial();
const listeners = new Set<() => void>();

export function setCanvasOpen(next: boolean): void {
  if (open === next) return;
  open = next;
  try {
    localStorage.setItem(KEY, next ? "1" : "0");
  } catch {
    /* ignore */
  }
  for (const l of listeners) l();
}

export function toggleCanvas(): void {
  setCanvasOpen(!open);
}

/* ------------------------------------------------------------------ */
/* 侧栏底部的 AI 助手面板：常驻、可收起（PRD/主界面.md §2.4）           */
/* ------------------------------------------------------------------ */

const CHAT_KEY = "lingrui-chat-open";

function initialChat(): boolean {
  try {
    const saved = localStorage.getItem(CHAT_KEY);
    if (saved === "0") return false;
    if (saved === "1") return true;
  } catch {
    /* ignore */
  }
  // 参考图里 AI 助手默认展开
  return true;
}

let chatOpen = initialChat();
const chatListeners = new Set<() => void>();

export function setChatOpen(next: boolean): void {
  if (chatOpen === next) return;
  chatOpen = next;
  try {
    localStorage.setItem(CHAT_KEY, next ? "1" : "0");
  } catch {
    /* ignore */
  }
  for (const l of chatListeners) l();
}

export function toggleChat(): void {
  setChatOpen(!chatOpen);
}

function subscribeChat(cb: () => void): () => void {
  chatListeners.add(cb);
  return () => chatListeners.delete(cb);
}

export function useChatOpen(): boolean {
  return useSyncExternalStore(subscribeChat, () => chatOpen, () => true);
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useCanvasOpen(): boolean {
  return useSyncExternalStore(subscribe, () => open, () => false);
}
