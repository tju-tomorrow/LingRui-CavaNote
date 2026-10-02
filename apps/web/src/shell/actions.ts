/**
 * 文档动作：导出 / 保存 / 分享（供顶栏与主标题区复用）+ 轻量 toast。
 */
import { useCallback, useState } from "react";
import { useKnowledgeNodes } from "../collab/useKnowledge";
import { buildMarkdown, downloadText } from "./export";
import { downloadBlob, recordAnimation } from "./recorder";
import { latestSnapshotAt, saveSnapshot } from "./snapshot";
import { copyShareLink } from "./share";

const DOC_TITLE = "一次请求的完整旅程";
const DOC_SUBTITLE = "AI 基础与架构 · 导出自 LingRui CavaNote";

export function toast(message: string): void {
  const el = document.createElement("div");
  el.className = "lr-toast";
  el.textContent = message;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add("in"));
  window.setTimeout(() => {
    el.classList.remove("in");
    window.setTimeout(() => el.remove(), 200);
  }, 2200);
}

/** 带一个动作按钮的 toast（如「撤销」），6 秒后自动消失 */
export function toastAction(message: string, actionLabel: string, onAction: () => void): void {
  const el = document.createElement("div");
  el.className = "lr-toast lr-toast-action";
  const text = document.createElement("span");
  text.textContent = message;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "lr-toast-btn";
  btn.textContent = actionLabel;

  let done = false;
  const dismiss = () => {
    el.classList.remove("in");
    window.setTimeout(() => el.remove(), 200);
  };
  btn.addEventListener("click", () => {
    if (done) return;
    done = true;
    onAction();
    dismiss();
  });

  el.append(text, btn);
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add("in"));
  window.setTimeout(() => {
    if (!done) dismiss();
  }, 6000);
}

function timeLabel(at: number | null): string {
  if (!at) return "保存";
  return `已保存 ${new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

export function useDocumentActions() {
  const nodes = useKnowledgeNodes();
  const [savedAt, setSavedAt] = useState<number | null>(() => latestSnapshotAt());
  const [recording, setRecording] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  const exportDoc = useCallback(async () => {
    const md = await buildMarkdown(DOC_TITLE, DOC_SUBTITLE, nodes);
    downloadText(`${DOC_TITLE}.md`, md);
    toast("已导出 Markdown");
  }, [nodes]);

  const save = useCallback(() => {
    const snap = saveSnapshot();
    setSavedAt(snap.at);
    toast("已保存快照");
  }, []);

  const exportVideo = useCallback(async () => {
    if (recording) return;
    setRecording(true);
    toast("正在录制视频…");
    try {
      const blob = await recordAnimation();
      downloadBlob("一次请求的完整旅程.webm", blob);
      toast("视频已导出（WebM）");
    } catch (e) {
      toast(`录制失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setRecording(false);
    }
  }, [recording]);

  const share = useCallback(async () => {
    const ok = await copyShareLink();
    if (ok) {
      toast("分享链接已复制到剪贴板");
      return;
    }
    // 剪贴板不可用（无 user activation / 非安全上下文）→ 把链接摆出来让用户自己复制
    setShareOpen(true);
  }, []);

  return {
    exportDoc,
    exportVideo,
    recording,
    save,
    share,
    shareOpen,
    closeShare: () => setShareOpen(false),
    savedAt,
    savedLabel: timeLabel(savedAt),
  };
}
