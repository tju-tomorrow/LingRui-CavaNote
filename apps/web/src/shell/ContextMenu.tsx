/**
 * 轻量右键菜单（笔记树等复用）
 *
 * 原生 `contextmenu` 事件 → 在鼠标位置弹一层浮层；点外部 / Esc 关闭。
 * 会自动避开视口边缘。
 */
import { useEffect, useLayoutEffect, useRef, useState, type JSX } from "react";

export interface MenuItem {
  label: string;
  onSelect: () => void;
  /** 右侧灰字提示（快捷键） */
  hint?: string;
  danger?: boolean;
  disabled?: boolean;
}

export function ContextMenu({
  x,
  y,
  items,
  onClose,
}: {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });

  // 贴边时把菜单拉回视口内
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const left = Math.min(x, window.innerWidth - rect.width - 8);
    const top = Math.min(y, window.innerHeight - rect.height - 8);
    setPos({ left: Math.max(8, left), top: Math.max(8, top) });
  }, [x, y]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div ref={ref} className="ctx-menu" role="menu" style={{ left: pos.left, top: pos.top }}>
      {items.map((item, index) => (
        <button
          key={index}
          type="button"
          role="menuitem"
          className={`ctx-item${item.danger ? " danger" : ""}`}
          disabled={item.disabled}
          onClick={() => {
            item.onSelect();
            onClose();
          }}
        >
          <span className="ctx-label">{item.label}</span>
          {item.hint ? <kbd className="ctx-hint">{item.hint}</kbd> : null}
        </button>
      ))}
    </div>
  );
}
