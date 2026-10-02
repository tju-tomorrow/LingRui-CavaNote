/**
 * 主标题区（PRD/主界面.md §2.5）
 *
 * 标题 / 元信息 / 标签 / 导出（Markdown）/ 视频（WebM）/ 分享 / 保存（版本快照）。
 *
 * 元信息是**按当前笔记算出来的**，不是写死的：归属 = 所在分组路径，
 * 日期 = 最后修改时间，阅读时长 = 正文字数 / 300 字每分钟。
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Download, History, Save, Share2, Sparkles, Video } from "lucide-react";
import { Button } from "../components/ui/button";
import { notePath, renameNote, setNoteTags, type NoteMeta } from "@lingrui/knowledge";
import { ydoc } from "../collab/doc";
import { generateFromNote } from "../chat/generate";
import { useNoteText } from "../collab/useKnowledge";
import { useDocumentActions } from "./actions";
import { HistoryPanel } from "./HistoryPanel";
import { ShareDialog } from "./ShareDialog";

function readingMinutes(text: string): number {
  // 中文按字数算：300 字/分钟是常见的中文阅读速度
  return Math.max(1, Math.round(text.replace(/\s+/g, "").length / 300));
}

function formatDate(at: number): string {
  return new Date(at).toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

export function DocHeader({ note }: { note: NoteMeta }) {
  const { exportDoc, exportVideo, recording, save, share, shareOpen, closeShare, savedLabel } =
    useDocumentActions();
  const [adding, setAdding] = useState(false);
  const [history, setHistory] = useState(false);

  // 标题就地编辑（回车 / 失焦保存，Esc 取消）
  const [title, setTitle] = useState(note.title);
  const cancelRef = useRef(false);
  useEffect(() => setTitle(note.title), [note.id, note.title]);
  const commitTitle = () => {
    const value = title.trim();
    if (value && value !== note.title) renameNote(ydoc, note.id, value);
    else setTitle(note.title);
  };

  // 正文用订阅拿（打字会实时更新字数），分组路径与日期看 note 元信息
  const text = useNoteText(note);
  const meta = useMemo(() => {
    const path = notePath(ydoc, note.id).map((n) => n.title);
    return {
      owner: path.length > 0 ? path.join(" / ") : "未分组",
      date: formatDate(note.updatedAt),
      minutes: readingMinutes(text),
      words: text.replace(/\s+/g, "").length,
    };
  }, [text, note.id, note.updatedAt, note.parentId]);

  const tags = note.tags ?? [];
  const addTag = (value: string) => {
    const tag = value.trim().replace(/^#/, "");
    if (!tag || tags.includes(tag)) return;
    setNoteTags(ydoc, note.id, [...tags, tag]);
  };
  const removeTag = (tag: string) => {
    setNoteTags(ydoc, note.id, tags.filter((t) => t !== tag));
  };

  return (
    <div className="doc-header">
      <div className="dh-main">
        <input
          className="doc-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => {
            // Esc 取消：blur 会先于 setState 生效，必须用 ref 标记跳过提交
            if (cancelRef.current) {
              cancelRef.current = false;
              setTitle(note.title);
              return;
            }
            commitTitle();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") {
              cancelRef.current = true;
              setTitle(note.title);
              e.currentTarget.blur();
            }
          }}
          placeholder="未命名笔记"
          aria-label="笔记标题"
          spellCheck={false}
        />
        <div className="doc-meta">
          {meta.owner} · {meta.date} · {meta.minutes} 分钟阅读（{meta.words} 字）
        </div>

        <div className="dh-tags">
          {tags.map((tag) => (
            <span key={tag} className="dh-tag">
              #{tag}
              <button type="button" title="移除标签" onClick={() => removeTag(tag)}>
                ✕
              </button>
            </span>
          ))}
          {adding ? (
            <input
              className="dh-tag-input"
              autoFocus
              placeholder="标签名（回车）"
              aria-label="添加笔记标签"
              onBlur={() => setAdding(false)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  addTag(e.currentTarget.value);
                  e.currentTarget.value = "";
                  setAdding(false);
                }
                if (e.key === "Escape") setAdding(false);
              }}
            />
          ) : (
            <button className="dh-tag-add" type="button" onClick={() => setAdding(true)}>
              ＋ 标签
            </button>
          )}
        </div>
      </div>

      <div className="doc-actions">
        <Button
          variant="outline"
          size="sm"
          onClick={() => generateFromNote(note)}
          title="根据这篇笔记的标题结构生成知识画布与讲解"
        >
          <Sparkles />
          生成讲解
        </Button>
        <Button variant="outline" size="sm" onClick={() => setHistory(true)} title="版本历史（⌘S 打点）">
          <History />
          历史
        </Button>
        <Button variant="outline" size="sm" onClick={() => void exportDoc()} title="导出 Markdown">
          <Download />
          导出
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void exportVideo()}
          disabled={recording}
          title="把演出录成 WebM 视频"
        >
          <Video />
          {recording ? "录制中…" : "视频"}
        </Button>
        <Button variant="outline" size="sm" onClick={() => void share()} title="复制分享链接">
          <Share2 />
          分享
        </Button>
        <Button size="sm" onClick={save} title="打一个版本快照">
          <Save />
          {savedLabel}
        </Button>
      </div>

      {history ? <HistoryPanel onClose={() => setHistory(false)} /> : null}
      {shareOpen ? <ShareDialog onClose={closeShare} /> : null}
    </div>
  );
}
