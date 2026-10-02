/**
 * 节点引擎面板（ADR-0013）
 *
 * 两种用途：
 *   - 新建节点：选 kind + 形状（draw.io stencil），然后点画布落地
 *   - 改选中节点：kind / 形状直接写回 Y.Doc
 *
 * draw.io 全套形状库有 200+ 个 XML，不能全量加载：这里按**库**懒加载，
 * 选中某个库才 fetch + 解析（见 stencil-library.ts）。
 */
import { useEffect, useMemo, useState, type JSX } from "react";
import type { NodeKind } from "@lingrui/knowledge";
import {
  ensureStencilManifest,
  loadStencilLibrary,
  listStencilShapes,
  type StencilEntry,
  type StencilLibrary,
} from "@lingrui/canvas";

const KINDS: Array<{ kind: NodeKind; label: string }> = [
  { kind: "client", label: "调用方" },
  { kind: "gateway", label: "网关" },
  { kind: "service", label: "服务" },
  { kind: "cache", label: "缓存" },
  { kind: "database", label: "数据库" },
  { kind: "queue", label: "队列" },
  { kind: "registry", label: "注册中心" },
  { kind: "monitor", label: "监控" },
  { kind: "concept", label: "概念" },
  { kind: "note", label: "笔记" },
];

/** 由 shape key（`rack.general.1u-rack-server`）反查库 id（`rack/general`） */
function libraryOfShape(key: string | undefined, libraries: StencilLibrary[]): string | undefined {
  if (!key) return undefined;
  let best: StencilLibrary | undefined;
  for (const lib of libraries) {
    if (key.startsWith(`${lib.id.replace(/\//g, ".")}.`)) {
      if (!best || lib.id.length > best.id.length) best = lib;
    }
  }
  return best?.id;
}

export function NodePalette({
  kind,
  shape,
  onKind,
  onShape,
  onClose,
  editing,
}: {
  kind: NodeKind;
  shape: string | undefined;
  onKind: (kind: NodeKind) => void;
  onShape: (shape: string | undefined) => void;
  onClose: () => void;
  editing?: boolean;
}): JSX.Element {
  const [libraries, setLibraries] = useState<StencilLibrary[]>([]);
  const [libraryId, setLibraryId] = useState<string>("");
  const [shapes, setShapes] = useState<StencilEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    void ensureStencilManifest().then((libs) => {
      if (mounted) setLibraries(libs);
    });
    return () => {
      mounted = false;
    };
  }, []);

  // 已有形状（编辑节点）→ 自动定位到对应库
  useEffect(() => {
    if (!shape || libraries.length === 0) return;
    const lib = libraryOfShape(shape, libraries);
    if (lib) setLibraryId(lib);
  }, [shape, libraries]);

  // 选库 → 懒加载 → 列出形状
  useEffect(() => {
    if (!libraryId) {
      setShapes([]);
      return;
    }
    let mounted = true;
    setLoading(true);
    const lib = libraries.find((l) => l.id === libraryId);
    if (!lib) {
      setLoading(false);
      return;
    }
    void loadStencilLibrary(lib).then(() => {
      if (!mounted) return;
      setShapes(listStencilShapes(libraryId).sort((a, b) => a.title.localeCompare(b.title)));
      setLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, [libraryId, libraries]);

  const title = useMemo(() => {
    if (!shape) return "";
    return shapes.find((s) => s.key === shape)?.title ?? shape;
  }, [shape, shapes]);

  return (
    <div className="node-palette">
      <div className="np-head">
        <span>{editing ? "编辑节点" : "新建节点"}</span>
        <button type="button" className="np-close" onClick={onClose} title="关闭">
          ×
        </button>
      </div>

      <div className="np-kinds">
        {KINDS.map((item) => (
          <button
            key={item.kind}
            type="button"
            className={`np-kind${kind === item.kind ? " is-active" : ""}`}
            onClick={() => onKind(item.kind)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <label className="np-shape-label">
        形状库
        <select
          className="np-shape"
          value={libraryId}
          onChange={(e) => setLibraryId(e.target.value)}
          disabled={libraries.length === 0}
        >
          <option value="">默认（按类型）</option>
          {libraries.map((lib) => (
            <option key={lib.id} value={lib.id}>
              {lib.title}
            </option>
          ))}
        </select>
      </label>

      <label className="np-shape-label">
        形状
        <select
          className="np-shape"
          value={shape ?? ""}
          onChange={(e) => onShape(e.target.value || undefined)}
          disabled={!libraryId || loading}
        >
          <option value="">— 选一个 —</option>
          {shapes.map((s) => (
            <option key={s.key} value={s.key}>
              {s.title}
            </option>
          ))}
        </select>
      </label>

      <div className="np-hint">
        {libraries.length === 0
          ? "形状库清单加载中…"
          : loading
            ? "形状库加载中…"
            : shape
              ? `已选：${title}`
              : "共 " + libraries.length + " 个 draw.io 形状库"}
      </div>
    </div>
  );
}
