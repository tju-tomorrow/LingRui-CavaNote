/**
 * 协同文档 —— 全应用唯一的一份 Y.Doc
 *
 * 拓扑（ADR-0006）：
 *   Y.Doc ──► y-indexeddb（本地，刷新不丢）
 *          └─► HocuspocusProvider（设置了 VITE_COLLAB_URL 时启用，多人实时）
 *
 * 文档视图（BlockNote）和画布视图（Excalidraw）读的都是这一个 doc。
 */
import * as Y from "yjs";
import { IndexeddbPersistence } from "y-indexeddb";
import { HocuspocusProvider } from "@hocuspocus/provider";
import {
  createKnowledgeDoc,
  getNodes,
  listNotes,
  upsertNode,
  upsertNote,
  type NoteMeta,
} from "@lingrui/knowledge";
import { authToken } from "../auth/store";
import { SEED_NODES } from "./seed";

export const DOC_ID = "lingrui-demo";
/** 默认笔记的正文 fragment：沿用老名字，老数据零迁移 */
export const BLOCK_FRAGMENT = "document-store";
export const DEFAULT_NOTE_TITLE = "一次请求的完整旅程";

export const ydoc = createKnowledgeDoc({ id: DOC_ID, title: "一次请求的完整旅程" });

/** 本地持久化：刷新/关页面不丢 */
export const localPersistence = new IndexeddbPersistence(DOC_ID, ydoc);

/** 远端协同：桌面端用内嵌服务，web 版看 VITE_COLLAB_URL */
const bridge = typeof window === "undefined" ? undefined : window.lingrui;
const COLLAB_URL = bridge?.collabUrl ?? (import.meta.env.VITE_COLLAB_URL as string | undefined);
/** 未登录时的回退 token（开发用：scripts/dev-token.mjs 铸的） */
const FALLBACK_TOKEN = bridge?.token ?? (import.meta.env.VITE_COLLAB_TOKEN as string | undefined);

/**
 * token 在**连接时**才取：登录 / 登出后调 `remoteProvider.connect()` 重新握手，
 * 于是身份切换不需要重建整个 provider（也就不会把本地 Y.Doc 换掉）。
 */
const currentToken = (): string => authToken() ?? FALLBACK_TOKEN ?? "";

export const remoteProvider: HocuspocusProvider | null = COLLAB_URL
  ? new HocuspocusProvider({
      url: COLLAB_URL,
      name: DOC_ID,
      document: ydoc,
      token: currentToken,
    })
  : null;

/** 登录态变化后重新连接（带新 token） */
export function reconnectCollab(): void {
  remoteProvider?.connect();
}

export const awareness = remoteProvider?.awareness ?? null;

/** 种子知识：等本地库加载完再写，避免和已有数据打架（Yjs 会按 id 合并） */
export const seeded: Promise<void> = localPersistence.whenSynced.then(() => {
  ydoc.transact(() => {
    // 笔记：老数据没有 notes root，但正文已经在 document-store 上 →
    // 把它认领为「默认笔记」，不做任何迁移
    if (listNotes(ydoc).length === 0) {
      upsertNote(ydoc, {
        id: "note-main",
        title: DEFAULT_NOTE_TITLE,
        fragment: BLOCK_FRAGMENT,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        order: 0,
      });
    }

    if (getNodes(ydoc).size === 0) {
      for (const node of SEED_NODES) upsertNode(ydoc, node);
    }
  });
});

/** 默认笔记 id（笔记树/编辑器都从它起步） */
export const DEFAULT_NOTE_ID = "note-main";

/** 能不能作为「当前笔记」打开（分组不行） */
export function isOpenableNote(note: NoteMeta | undefined): boolean {
  return Boolean(note) && !note!.isFolder && note!.fragment !== "";
}

/**
 * 某个笔记的正文 fragment。
 *
 * 分组（文件夹）没有正文 —— `fragment` 是空串。这里必须拦下来：
 * `ydoc.getXmlFragment("")` 会**创建一个名字为空的幽灵 fragment**，
 * 编辑器绑上去之后往里写的东西全部无处安放（而且会同步给所有人）。
 */
export function blockFragment(note?: NoteMeta | null): Y.XmlFragment {
  const name = note?.fragment;
  if (note?.isFolder || name === "") {
    throw new Error(`分组没有正文：${note?.title ?? "?"}`);
  }
  return ydoc.getXmlFragment(name ?? BLOCK_FRAGMENT);
}

// 开发期调试入口：控制台里 __lingrui.ydoc / __lingrui.seeded 可直接查
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>)["__lingrui"] = {
    ydoc,
    localPersistence,
    remoteProvider,
    seeded,
  };
}
