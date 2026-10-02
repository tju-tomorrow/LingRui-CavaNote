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
  renameNote,
  trashNoteDeep,
  type NoteMeta,
  type NoteTreeNode,
} from "@lingrui/knowledge";
import { ydoc } from "../collab/doc";
import { useKnowledgeNodes, useKnowledgeNotes, useTrashedNotes } from "../collab/useKnowledge";
import { setFocus, useFocus } from "../state/focus";
import { setActiveNote, useActiveNote } from "../state/notes";
import { toastAction } from "./actions";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from "../components/ui/context-menu";
import { IconChevron, IconFolder, IconMore, IconNote, IconTrash } from "./icons";
import { TrashDialog } from "./TrashDialog";

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

export function NoteTree() {
  const nodes = useKnowledgeNodes();
  const notes = useKnowledgeNotes();
  const trashed = useTrashedNotes();
  const active = useActiveNote();
  const focus = useFocus();
  const { collapsed, toggle } = useCollapsed();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [trashOpen, setTrashOpen] = useState(false);
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
      // 软删除：只改 notes map（打 trashedAt），Yjs 墓碑仍在 →
      // 建一个「只跟踪这一步」的 UndoManager，toast 里的「撤销」能整段还原。
      const undo = new Y.UndoManager([getNotes(ydoc) as unknown as Y.AbstractType<unknown>], {
        captureTimeout: 0,
      });
      ydoc.transact(() => {
        trashNoteDeep(ydoc, note.id);
      });

      // listNotes 已排除回收站，所以这里天然只会选到还活着的笔记
      const remaining = listNotes(ydoc);
      if (active === note.id || !remaining.some((n) => n.id === active)) {
        const next = remaining.find((n) => !n.isFolder);
        if (next) setActiveNote(next.id);
      }

      toastAction(`已移入回收站「${note.title}」`, "撤销", () => undo.undo());
    },
    [active],
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

  /** 右键 / 「⋯」共用的菜单项（shadcn ContextMenu） */
  const renderMenuItems = (note: NoteMeta) => (
    <>
      {note.isFolder ? (
        <>
          <ContextMenuItem onSelect={() => addNote(note.id)}>
            新建笔记
            <ContextMenuShortcut>⌘N</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => addFolder(note.id)}>
            新建子分组
            <ContextMenuShortcut>⇧⌘N</ContextMenuShortcut>
          </ContextMenuItem>
        </>
      ) : (
        <>
          <ContextMenuItem onSelect={() => setActiveNote(note.id)}>打开</ContextMenuItem>
          <ContextMenuItem onSelect={() => addNote(note.parentId ?? null)}>
            在此层级新建笔记
            <ContextMenuShortcut>⌘N</ContextMenuShortcut>
          </ContextMenuItem>
        </>
      )}
      <ContextMenuSeparator />
      <ContextMenuItem onSelect={() => setEditingId(note.id)}>
        重命名
        <ContextMenuShortcut>F2</ContextMenuShortcut>
      </ContextMenuItem>
      <ContextMenuItem variant="destructive" onSelect={() => remove(note)}>
        删除
        <ContextMenuShortcut>⌫</ContextMenuShortcut>
      </ContextMenuItem>
    </>
  );

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
        <ContextMenu>
          <ContextMenuTrigger asChild>
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
            <button
              type="button"
              title="更多"
              onClick={(e) => {
                e.stopPropagation();
                // 让 Radix 的 ContextMenu 在按钮处打开（派发一个冒泡的 contextmenu）
                const row = e.currentTarget.closest(".tree-item");
                const rect = e.currentTarget.getBoundingClientRect();
                row?.dispatchEvent(
                  new MouseEvent("contextmenu", {
                    bubbles: true,
                    clientX: rect.left,
                    clientY: rect.bottom,
                  }),
                );
              }}
            >
              <IconMore size={14} />
            </button>
          </span>
        </div>
          </ContextMenuTrigger>
          <ContextMenuContent>{renderMenuItems(note)}</ContextMenuContent>
        </ContextMenu>

        {isFolder && !isCollapsed ? children.map(renderRow) : null}
        {!isFolder ? children.map(renderRow) : null}
      </div>
    );
  };

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

      <button
        type="button"
        className="tree-trash"
        onClick={() => setTrashOpen(true)}
        title="回收站"
      >
        <IconTrash size={14} />
        <span>回收站</span>
        {trashed.length > 0 ? <span className="tree-trash-count">{trashed.length}</span> : null}
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

      {trashOpen ? <TrashDialog onClose={() => setTrashOpen(false)} /> : null}
    </nav>
  );
}
