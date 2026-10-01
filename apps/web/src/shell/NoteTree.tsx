/**
 * 笔记树（PRD/主界面.md §2.3、§5.5）
 *
 * 两段：
 *   1. **目录树**——真实的多级分组 + 笔记（Y.Doc 的 notes root，靠 parentId 组树）
 *      · 单击打开 / 双击重命名 / 右键菜单 / 悬停「⋯」
 *      · **拖拽**：拖到分组上=移进去，拖到行的上/下半区=排到前/后，拖到空白=移到顶层末尾
 *      · 快捷键：⌘N 新建笔记、⇧⌘N 新建分组、F2 重命名、⌫ 删除（带「撤销」）
 *   2. **知识节点**——从 Y.Doc 派生，点击 = 聚焦（画布高亮 + 文档滚动 + 详情卡弹出）
 *
 * 「知识是全局的、笔记是多份的」：所以节点列表不随笔记切换而变。
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import * as Y from "yjs";
import {
  buildNoteTree,
  createFolder,
  createNote,
  getNotes,
  listNotes,
  moveNoteTo,
  readNote,
  reconcileBlockIds,
  removeNoteDeep,
  renameNote,
  type NoteMeta,
  type NoteTreeNode,
} from "@lingrui/knowledge";
import { ydoc } from "../collab/doc";
import { useKnowledgeNodes, useKnowledgeNotes } from "../collab/useKnowledge";
import { setFocus, useFocus } from "../state/focus";
import { setActiveNote, useActiveNote } from "../state/notes";
import { toastAction } from "./actions";
import { ContextMenu, type MenuItem } from "./ContextMenu";
import { IconChevron, IconFolder, IconMore, IconNote } from "./icons";

/** 折叠状态存 localStorage：刷新后保持展开的样子 */
const COLLAPSED_KEY = "lingrui-tree-collapsed";

function loadCollapsed(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

function useCollapsed() {
  const [collapsed, setCollapsed] = useState<Set<string>>(loadCollapsed);
  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...next]));
      } catch {
        /* ignore */
      }
      return next;
    });
  return { collapsed, toggle };
}

type DropPos = "before" | "after" | "inside";

function findNode(list: NoteTreeNode[], id: string): NoteTreeNode | undefined {
  for (const node of list) {
    if (node.note.id === id) return node;
    const hit = findNode(node.children, id);
    if (hit) return hit;
  }
  return undefined;
}

function flattenIds(node: NoteTreeNode): string[] {
  return [node.note.id, ...node.children.flatMap(flattenIds)];
}

export function NoteTree() {
  const nodes = useKnowledgeNodes();
  const notes = useKnowledgeNotes();
  const active = useActiveNote();
  const focus = useFocus();
  const { collapsed, toggle } = useCollapsed();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; noteId: string } | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [drop, setDrop] = useState<{ id: string; pos: DropPos } | null>(null);
  // 拖拽源/落点用 ref：dragover 与 drop 可能同 tick，state 还没提交
  const dragIdRef = useRef<string | null>(null);
  const dropRef = useRef<{ id: string; pos: DropPos } | null>(null);

  const tree = useMemo(() => buildNoteTree(ydoc), [notes]);
  const byId = useMemo(() => {
    const map = new Map<string, NoteMeta>();
    for (const note of listNotes(ydoc)) map.set(note.id, note);
    return map;
  }, [notes]);

  /** 当前笔记所在的父分组（新建时放进同一层，符合直觉） */
  const parentOfActive = useMemo(() => findNode(tree, active ?? "")?.note.parentId ?? null, [tree, active]);

  const addNote = useCallback((parentId: string | null) => {
    const note = createNote(ydoc, "未命名笔记", parentId);
    setActiveNote(note.id);
    setEditingId(note.id);
  }, []);

  const addFolder = useCallback((parentId: string | null) => {
    const folder = createFolder(ydoc, "新建分组", parentId);
    setEditingId(folder.id);
  }, []);

  const remove = useCallback(
    (note: NoteMeta) => {
      // 圈定这次删除会动到的 Y 类型，建一个「只跟踪这一步」的 UndoManager，
      // 这样 toast 里的「撤销」能整段还原（Yjs 删除是墓碑，可逆）。
      const target = findNode(tree, note.id);
      const ids = target ? flattenIds(target) : [note.id];
      const scopes: Y.AbstractType<unknown>[] = [
        getNotes(ydoc) as unknown as Y.AbstractType<unknown>,
      ];
      for (const id of ids) {
        const fragment = readNote(ydoc, id)?.fragment;
        if (fragment) scopes.push(ydoc.getXmlFragment(fragment) as unknown as Y.AbstractType<unknown>);
      }
      const undo = new Y.UndoManager(scopes, { captureTimeout: 0 });

      ydoc.transact(() => {
        removeNoteDeep(ydoc, note.id);
      });

      // 对账：清掉指向已不存在文档块的幽灵引用
      const survivors = listNotes(ydoc)
        .map((n) => n.fragment)
        .filter(Boolean);
      reconcileBlockIds(ydoc, survivors);

      const remaining = listNotes(ydoc);
      if (active === note.id || !remaining.some((n) => n.id === active)) {
        const next = remaining.find((n) => n.id !== note.id && !n.isFolder);
        if (next) setActiveNote(next.id);
      }

      toastAction(`已删除「${note.title}」`, "撤销", () => undo.undo());
    },
    [tree, active],
  );

  // ---------------- 拖拽 ----------------
  const isDescendant = useCallback(
    (ancestorId: string, maybeChildId: string): boolean => {
      let cursor: string | null = maybeChildId;
      while (cursor) {
        if (cursor === ancestorId) return true;
        cursor = byId.get(cursor)?.parentId ?? null;
      }
      return false;
    },
    [byId],
  );

  const onDragOverRow = (e: ReactDragEvent<HTMLDivElement>, note: NoteMeta) => {
    const dragging = dragIdRef.current;
    if (!dragging || dragging === note.id || isDescendant(dragging, note.id)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientY - rect.top) / rect.height;
    const pos: DropPos = note.isFolder
      ? ratio < 0.28
        ? "before"
        : ratio > 0.72
          ? "after"
          : "inside"
      : ratio < 0.5
        ? "before"
        : "after";
    setDrop({ id: note.id, pos });
    dropRef.current = { id: note.id, pos };
  };

  const applyDrop = () => {
    const dragged = dragIdRef.current;
    const landed = dropRef.current;
    const target = landed ? byId.get(landed.id) : undefined;
    dragIdRef.current = null;
    dropRef.current = null;
    setDragId(null);
    setDrop(null);
    if (!dragged || !target || !landed) return;

    if (landed.pos === "inside") {
      const count = listNotes(ydoc).filter(
        (n) => (n.parentId ?? null) === target.id && n.id !== dragged,
      ).length;
      moveNoteTo(ydoc, dragged, target.id, count);
    } else {
      const parentId = target.parentId ?? null;
      const siblings = listNotes(ydoc).filter(
        (n) => (n.parentId ?? null) === parentId && n.id !== dragged,
      );
      const index = siblings.findIndex((n) => n.id === target.id);
      moveNoteTo(ydoc, dragged, parentId, landed.pos === "before" ? Math.max(0, index) : index + 1);
    }
  };

  /** 拖到树的空白处 → 移到顶层末尾 */
  const onDropRoot = (e: ReactDragEvent<HTMLDivElement>) => {
    const dragged = dragIdRef.current;
    if (!dragged) return;
    e.preventDefault();
    const count = listNotes(ydoc).filter(
      (n) => (n.parentId ?? null) === null && n.id !== dragged,
    ).length;
    moveNoteTo(ydoc, dragged, null, count);
    dragIdRef.current = null;
    dropRef.current = null;
    setDragId(null);
    setDrop(null);
  };

  // ---------------- 快捷键 ----------------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        !!target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "n") {
        e.preventDefault();
        if (e.shiftKey) addFolder(parentOfActive);
        else addNote(parentOfActive);
        return;
      }
      if (typing || !active) return;
      if (e.key === "F2") {
        e.preventDefault();
        setEditingId(active);
      } else if (e.key === "Delete" || e.key === "Backspace") {
        const note = byId.get(active);
        if (note) {
          e.preventDefault();
          remove(note);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, byId, parentOfActive, addNote, addFolder, remove]);

  const openMenu = (e: ReactMouseEvent, noteId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY, noteId });
  };

  const menuItems = (note: NoteMeta): MenuItem[] => {
    const items: MenuItem[] = [];
    if (note.isFolder) {
      items.push({ label: "新建笔记", hint: "⌘N", onSelect: () => addNote(note.id) });
      items.push({ label: "新建子分组", hint: "⇧⌘N", onSelect: () => addFolder(note.id) });
    } else {
      items.push({ label: "打开", onSelect: () => setActiveNote(note.id) });
      items.push({
        label: "在此层级新建笔记",
        hint: "⌘N",
        onSelect: () => addNote(note.parentId ?? null),
      });
    }
    items.push({ label: "重命名", hint: "F2", onSelect: () => setEditingId(note.id) });
    items.push({ label: "删除", hint: "⌫", danger: true, onSelect: () => remove(note) });
    return items;
  };

  const renderRow = (node: NoteTreeNode) => {
    const { note, children, depth } = node;
    const indent = 6 + depth * 16;
    const isFolder = Boolean(note.isFolder);
    const isCollapsed = collapsed.has(note.id);

    if (editingId === note.id) {
      return (
        <input
          key={note.id}
          className="tree-rename"
          style={{ marginLeft: indent }}
          defaultValue={note.title}
          autoFocus
          aria-label="名称"
          onFocus={(e) => e.currentTarget.select()}
          onBlur={(e) => {
            const value = e.target.value.trim();
            if (value && value !== note.title) renameNote(ydoc, note.id, value);
            setEditingId(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") setEditingId(null);
          }}
        />
      );
    }

    const dropClass = drop?.id === note.id ? ` drop-${drop.pos}` : "";

    return (
      <div key={note.id} className="tree-branch">
        <div
          className={`tree-item${active === note.id ? " active" : ""}${isFolder ? " tree-folder" : ""}${dragId === note.id ? " dragging" : ""}${dropClass}`}
          style={{ paddingLeft: indent }}
          draggable
          onDragStart={(e) => {
            dragIdRef.current = note.id;
            setDragId(note.id);
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", note.id);
          }}
          onDragEnd={() => {
            dragIdRef.current = null;
            dropRef.current = null;
            setDragId(null);
            setDrop(null);
          }}
          onDragOver={(e) => onDragOverRow(e, note)}
          onDragLeave={() => {
            if (dropRef.current?.id === note.id) dropRef.current = null;
            setDrop((d) => (d?.id === note.id ? null : d));
          }}
          onDrop={(e) => {
            e.preventDefault();
            applyDrop();
          }}
          onContextMenu={(e) => openMenu(e, note.id)}
          onClick={(e) => {
            if (isFolder) return;
            if ((e.target as HTMLElement).closest("button.tree-twisty")) return;
            setActiveNote(note.id);
          }}
        >
          {isFolder ? (
            <button
              className={`tree-twisty${isCollapsed ? "" : " open"}`}
              type="button"
              aria-label={isCollapsed ? "展开" : "折叠"}
              onClick={(e) => {
                e.stopPropagation();
                toggle(note.id);
              }}
            >
              <IconChevron size={13} />
            </button>
          ) : (
            <span className="tree-twisty tree-twisty-leaf" />
          )}

          <span className="tree-kind">
            {isFolder ? <IconFolder size={14} /> : <IconNote size={14} />}
          </span>

          <button
            type="button"
            className="tree-note-btn"
            onClick={() => (isFolder ? toggle(note.id) : setActiveNote(note.id))}
            onDoubleClick={() => setEditingId(note.id)}
            title={isFolder ? "单击折叠 · 双击重命名 · 右键更多" : "单击打开 · 双击重命名 · 右键更多"}
          >
            {note.title}
            {note.tags?.length ? (
              <span className="tree-tags">{note.tags.map((t) => `#${t}`).join(" ")}</span>
            ) : null}
          </button>

          <span className="tree-note-actions">
            {isFolder ? (
              <button
                type="button"
                title="在此分组下新建笔记"
                onClick={(e) => {
                  e.stopPropagation();
                  addNote(note.id);
                }}
              >
                ＋
              </button>
            ) : null}
            <button type="button" title="更多" onClick={(e) => openMenu(e, note.id)}>
              <IconMore size={14} />
            </button>
          </span>
        </div>

        {isFolder && !isCollapsed ? children.map(renderRow) : null}
        {!isFolder ? children.map(renderRow) : null}
      </div>
    );
  };

  const menuNote = menu ? byId.get(menu.noteId) : undefined;

  return (
    <nav className="tree" onContextMenu={(e) => e.preventDefault()}>
      <div className="tree-head">
        <span>笔记</span>
        <span className="tree-actions">
          <button type="button" title="新建笔记（⌘N）" onClick={() => addNote(parentOfActive)}>
            ＋
          </button>
          <button type="button" title="新建分组（⇧⌘N）" onClick={() => addFolder(parentOfActive)}>
            ▤
          </button>
        </span>
      </div>

      <div
        className="tree-root"
        onDragOver={(e) => {
          if (dragIdRef.current) e.preventDefault();
        }}
        onDrop={onDropRoot}
      >
        {tree.length === 0 ? (
          <div className="tree-empty">还没有笔记 —— 点右下「＋ 新建笔记」</div>
        ) : (
          tree.map(renderRow)
        )}
      </div>

      <button type="button" className="tree-new" onClick={() => addNote(parentOfActive)}>
        ＋ 新建笔记
      </button>

      <div className="tree-group">知识节点（{nodes.length}）</div>
      {nodes.map((n) => (
        <button
          key={n.id}
          type="button"
          className={`tree-node${focus === n.id ? " active" : ""}`}
          style={{ paddingLeft: 18 }}
          onClick={() => setFocus(n.id)}
          title={n.summary ?? n.title}
        >
          <span className={`tree-dot kind-${n.kind}`} />
          <span>{n.title}</span>
        </button>
      ))}

      {menu && menuNote ? (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={menuItems(menuNote)}
          onClose={() => setMenu(null)}
        />
      ) : null}
    </nav>
  );
}
