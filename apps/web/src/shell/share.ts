/**
 * 只读分享（PRD/导出与分发.md §3）
 *
 * P1.5 版：带 `#share=<docId>` 的链接 = 只读视图。
 *
 * 为什么做成 store 而不是每次渲染读 `location.hash`：
 * 渲染期读 hash 的话，hash 变了（同页导航 / 手动改地址）界面不会重渲染，
 * 而且四个组件各读一次、各判一次，容易漏。这里统一订阅 `hashchange`。
 *
 * ⚠️ 这只是**客户端**的只读；真正的权限要靠服务端。现在唯一的写入口
 * （提问 → agent → 改 Y.Doc）已经在 chat/ask.ts 里被挡住。
 */
import { useSyncExternalStore } from "react";
import { DOC_ID } from "../collab/doc";

function read(): boolean {
  if (typeof window === "undefined") return false;
  const hash = window.location.hash.replace(/^#/, "");
  return new URLSearchParams(hash).has("share");
}

let readOnly = read();
const listeners = new Set<() => void>();

if (typeof window !== "undefined") {
  window.addEventListener("hashchange", () => {
    const next = read();
    if (next === readOnly) return;
    readOnly = next;
    for (const l of listeners) l();
  });
}

export function isReadOnlyShare(): boolean {
  return readOnly;
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useReadOnlyShare(): boolean {
  return useSyncExternalStore(subscribe, isReadOnlyShare, () => false);
}

export function shareUrl(): string {
  const url = new URL(window.location.href);
  url.hash = `share=${DOC_ID}`;
  return url.toString();
}

export async function copyShareLink(): Promise<boolean> {
  const link = shareUrl();
  try {
    await navigator.clipboard.writeText(link);
    return true;
  } catch {
    return false;
  }
}
