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
import { createKnowledgeDoc, getNodes, upsertNode } from "@lingrui/knowledge";
import { SEED_NODES } from "./seed";

export const DOC_ID = "lingrui-demo";
export const BLOCK_FRAGMENT = "document-store";

export const ydoc = createKnowledgeDoc({ id: DOC_ID, title: "一次请求的完整旅程" });

/** 本地持久化：刷新/关页面不丢 */
export const localPersistence = new IndexeddbPersistence(DOC_ID, ydoc);

/** 远端协同：只在配置了服务端地址时启用 */
const COLLAB_URL = import.meta.env.VITE_COLLAB_URL as string | undefined;

export const remoteProvider: HocuspocusProvider | null = COLLAB_URL
  ? new HocuspocusProvider({
      url: COLLAB_URL,
      name: DOC_ID,
      document: ydoc,
      token: () => (import.meta.env.VITE_COLLAB_TOKEN as string | undefined) ?? "",
    })
  : null;

export const awareness = remoteProvider?.awareness ?? null;

/** 种子知识：等本地库加载完再写，避免和已有数据打架（Yjs 会按 id 合并） */
export const seeded: Promise<void> = localPersistence.whenSynced.then(() => {
  if (getNodes(ydoc).size > 0) return;
  ydoc.transact(() => {
    for (const node of SEED_NODES) upsertNode(ydoc, node);
  });
});

export function blockFragment(): Y.XmlFragment {
  return ydoc.getXmlFragment(BLOCK_FRAGMENT);
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
