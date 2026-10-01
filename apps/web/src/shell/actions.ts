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

function timeLabel(at: number | null): string {
  if (!at) return "保存";
  return `已保存 ${new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

export function useDocumentActions() {
  const nodes = useKnowledgeNodes();
  const [savedAt, setSavedAt] = useState<number | null>(() => latestSnapshotAt());
  const [recording, setRecording] = useState(false);

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
    toast(ok ? "分享链接已复制到剪贴板" : "复制失败，请手动复制地址栏");
  }, []);

  return { exportDoc, exportVideo, recording, save, share, savedAt, savedLabel: timeLabel(savedAt) };
}
