/**
 * 分享（PRD/导出与分发.md §3）
 *
 * P1.5 版：生成带 `#share=<docId>` 的**只读链接**并复制到剪贴板；
 * 打开带该 hash 的页面时，顶部显示"只读分享"横幅。
 * 真正的权限/服务端分享为 P4 后半段。
 */
import { DOC_ID } from "../collab/doc";

export function shareUrl(): string {
  const url = new URL(window.location.href);
  url.hash = `share=${DOC_ID}`;
  return url.toString();
}

export function isReadOnlyShare(): boolean {
  const hash = window.location.hash.replace(/^#/, "");
  return new URLSearchParams(hash).has("share");
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
