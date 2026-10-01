/**
 * 可拖拽分栏（文档 ↔ 画布）
 *
 * 拖动中间的细条调整「文档 / 画布」宽度比例，松手后记住（localStorage）。
 * 双击细条恢复默认。宽度写成 :root 上的 --doc-w，由 polish.css 的 .workspace 消费。
 */
import { useCallback, useEffect, useRef, type JSX, type PointerEvent as ReactPointerEvent } from "react";

const KEY = "lingrui-doc-width";
const DEFAULT = "38%";

export function Splitter(): JSX.Element {
  const dragging = useRef(false);

  // 启动时恢复上次的宽度
  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY);
      if (saved) document.documentElement.style.setProperty("--doc-w", saved);
    } catch {
      /* ignore */
    }
  }, []);

  const onPointerDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    dragging.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    document.body.classList.add("col-resizing");
  }, []);

  const onPointerMove = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    const workspace = e.currentTarget.parentElement;
    if (!workspace) return;
    const rect = workspace.getBoundingClientRect();
    const pct = Math.min(68, Math.max(22, ((e.clientX - rect.left) / rect.width) * 100));
    document.documentElement.style.setProperty("--doc-w", `${pct.toFixed(2)}%`);
  }, []);

  const endDrag = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    dragging.current = false;
    document.body.classList.remove("col-resizing");
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    try {
      const value = getComputedStyle(document.documentElement).getPropertyValue("--doc-w").trim();
      if (value) localStorage.setItem(KEY, value);
    } catch {
      /* ignore */
    }
  }, []);

  const onDoubleClick = useCallback(() => {
    document.documentElement.style.setProperty("--doc-w", DEFAULT);
    try {
      localStorage.setItem(KEY, DEFAULT);
    } catch {
      /* ignore */
    }
  }, []);

  return (
    <div
      className="splitter"
      role="separator"
      aria-orientation="vertical"
      title="拖动调整宽度 · 双击复位"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onDoubleClick={onDoubleClick}
    />
  );
}
