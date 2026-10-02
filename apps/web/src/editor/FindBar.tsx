/**
 * 笔记内查找（⌘F）
 *
 * 全局搜索（⌘K）是跨笔记的；这里补上**单篇正文内**的查找与高亮。
 *
 * 实现用 CSS Custom Highlight API（Chrome 105+ / Electron 均支持）：
 * 直接对 DOM 里的文本节点建 Range 交给浏览器高亮，**不改动 ProseMirror 文档**，
 * 所以不会和 BlockNote 的编辑状态打架，也不需要注入 decoration。
 * 不支持该 API 时降级成「只报数量、不画高亮」，功能仍可用。
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { NoteMeta } from "@lingrui/knowledge";
import { useNoteText } from "../collab/useKnowledge";

const HL_ALL = "lr-find";
const HL_ACTIVE = "lr-find-active";

type HighlightCtor = new (...ranges: Range[]) => object;
interface HighlightRegistry {
  set(name: string, highlight: object): void;
  delete(name: string): void;
}

function registry(): HighlightRegistry | undefined {
  return (CSS as unknown as { highlights?: HighlightRegistry }).highlights;
}

function makeHighlight(ranges: Range[]): object | undefined {
  const Ctor = (window as unknown as { Highlight?: HighlightCtor }).Highlight;
  if (!Ctor) return undefined;
  return new Ctor(...ranges);
}

/** 在编辑器 DOM 里收集所有匹配的 Range（大小写不敏感） */
function collectMatches(query: string): Range[] {
  const root = document.querySelector(".editor-host .bn-editor");
  if (!root || !query) return [];
  const needle = query.toLowerCase();
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const ranges: Range[] = [];
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const text = node.nodeValue ?? "";
    const hay = text.toLowerCase();
    let at = hay.indexOf(needle);
    while (at !== -1) {
      const range = document.createRange();
      range.setStart(node, at);
      range.setEnd(node, at + needle.length);
      ranges.push(range);
      at = hay.indexOf(needle, at + needle.length);
    }
  }
  return ranges;
}

function scrollRangeIntoView(range: Range): void {
  const host = document.querySelector<HTMLElement>(".editor-host");
  if (!host) return;
  const rect = range.getBoundingClientRect();
  const hostRect = host.getBoundingClientRect();
  const delta = rect.top - hostRect.top - hostRect.height / 2 + rect.height / 2;
  host.scrollTo({ top: host.scrollTop + delta, behavior: "smooth" });
}

export function FindBar({
  note,
  focusKey,
  onClose,
}: {
  note: NoteMeta;
  focusKey: number;
  onClose: () => void;
}) {
  // 正文变了就重算（编辑时高亮不失效）
  const text = useNoteText(note);
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const matches = useMemo(() => collectMatches(query), [query, text]);

  // 每次唤出（含再次 ⌘F）都把焦点拉回输入框
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [focusKey]);

  // 匹配数变化时把当前下标夹回有效范围
  useEffect(() => {
    setIndex((i) => (matches.length === 0 ? 0 : Math.min(i, matches.length - 1)));
  }, [matches.length]);

  // 应用高亮 + 当前项高亮
  useEffect(() => {
    const reg = registry();
    if (!reg) return;
    if (matches.length === 0) {
      reg.delete(HL_ALL);
      reg.delete(HL_ACTIVE);
      return;
    }
    const all = makeHighlight(matches);
    if (all) reg.set(HL_ALL, all);
    const active = matches[index];
    const one = active ? makeHighlight([active]) : undefined;
    if (one) reg.set(HL_ACTIVE, one);
    else reg.delete(HL_ACTIVE);
  }, [matches, index]);

  // 关闭时清掉高亮
  useEffect(
    () => () => {
      const reg = registry();
      reg?.delete(HL_ALL);
      reg?.delete(HL_ACTIVE);
    },
    [],
  );

  const goto = (next: number) => {
    if (matches.length === 0) return;
    const i = ((next % matches.length) + matches.length) % matches.length;
    setIndex(i);
    const range = matches[i];
    if (range) scrollRangeIntoView(range);
  };

  const count = matches.length > 0 ? `${index + 1}/${matches.length}` : query ? "0/0" : "";

  return (
    <div className="find-bar" role="search">
      <input
        ref={inputRef}
        className="find-input"
        value={query}
        placeholder="在本文中查找…"
        aria-label="在本文中查找"
        onChange={(e) => {
          setQuery(e.target.value);
          setIndex(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            goto(e.shiftKey ? index - 1 : index + 1);
          }
          if (e.key === "Escape") {
            e.preventDefault();
            onClose();
          }
        }}
      />
      <span className="find-count">{count}</span>
      <button type="button" className="find-btn" title="上一个（⇧Enter）" onClick={() => goto(index - 1)}>
        ↑
      </button>
      <button type="button" className="find-btn" title="下一个（Enter）" onClick={() => goto(index + 1)}>
        ↓
      </button>
      <button type="button" className="find-btn" title="关闭（Esc）" onClick={onClose}>
        ✕
      </button>
    </div>
  );
}
