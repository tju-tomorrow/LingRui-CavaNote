/**
 * draw.io stencil 库（全套，204 个 XML / ~42MB）—— ADR-0013「真实表现力」
 *
 * draw.io 的形状库就是一堆 `<shapes>` XML。maxGraph 的 `StencilShape` 能直接解析。
 * 全量太大不能开机全load，所以：
 *   1. `manifest.json` 列出所有库（id / title / file）
 *   2. **按需懒加载**：用到哪个库才 fetch + 解析（并缓存）
 *   3. `ensureLibrariesForShapes()`：从现有节点的 `meta.shape` 反推需要哪些库
 */

export interface StencilLibrary {
  /** 库 id（manifest 里的相对路径去掉 .xml），也是形状 key 的前缀 */
  id: string;
  title: string;
  /** 静态资源路径，如 /stencils/rack/general.xml */
  file: string;
}

export interface StencilEntry {
  key: string;
  title: string;
  library: string;
}

const MANIFEST_URL = "/stencils/manifest.json";

/** 懒引入的 maxGraph 解析器（避免纯逻辑测试时加载 DOM 依赖） */
async function stencilApi() {
  return import("@maxgraph/core");
}

let manifest: StencilLibrary[] | null = null;
let manifestPromise: Promise<StencilLibrary[]> | null = null;

/** 库 id → key 前缀（`rack/general` → `rack.general`） */
function prefixOf(libraryId: string): string {
  return libraryId.replace(/\//g, ".");
}

const registry = new Map<string, StencilEntry>();
const loaded = new Set<string>();
const loading = new Map<string, Promise<StencilEntry[]>>();
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

export function subscribeStencils(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export async function ensureStencilManifest(): Promise<StencilLibrary[]> {
  if (manifest) return manifest;
  if (!manifestPromise) {
    manifestPromise = fetch(MANIFEST_URL)
      .then((r) => (r.ok ? r.json() : []))
      .then((libs: StencilLibrary[]) => {
        manifest = Array.isArray(libs) ? libs : [];
        return manifest;
      })
      .catch(() => {
        manifest = [];
        return manifest;
      });
  }
  return manifestPromise;
}

/** 同步读取已就绪的 manifest（未加载完返回空） */
export function listStencilLibraries(): StencilLibrary[] {
  return manifest ?? [];
}

function slug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** 解析一段 stencil XML 并注册（libraryId 决定 key 前缀）；单个形状失败不影响其它 */
export async function registerStencilXml(
  xmlText: string,
  libraryId: string,
): Promise<StencilEntry[]> {
  const { StencilShape, StencilShapeRegistry } = await stencilApi();
  const doc = new DOMParser().parseFromString(xmlText, "application/xml");
  const root = doc.documentElement;
  if (!root) return [];

  const prefix = prefixOf(libraryId);
  const added: StencilEntry[] = [];
  for (const node of Array.from(root.children)) {
    if (node.tagName !== "shape") continue;
    const name = node.getAttribute("name");
    if (!name) continue;
    const key = `${prefix}.${slug(name)}`;
    if (registry.has(key)) continue;
    try {
      StencilShapeRegistry.add(key, new StencilShape(node));
      const entry: StencilEntry = { key, title: name, library: libraryId };
      registry.set(key, entry);
      added.push(entry);
    } catch {
      /* 个别形状用了 unsupported 语法：跳过 */
    }
  }
  return added;
}

/** 懒加载单个库（幂等；已加载返回缓存） */
export async function loadStencilLibrary(library: StencilLibrary): Promise<StencilEntry[]> {
  if (loaded.has(library.id)) return listStencilShapes(library.id);
  const inflight = loading.get(library.id);
  if (inflight) return inflight;

  const job = fetch(library.file)
    .then((r) => (r.ok ? r.text() : ""))
    .then((text) => (text ? registerStencilXml(text, library.id) : []))
    .catch(() => [])
    .then((added) => {
      loaded.add(library.id);
      loading.delete(library.id);
      emit();
      return added;
    });

  loading.set(library.id, job);
  return job;
}

/**
 * 从一组形状 key 反推需要哪些库并加载。
 * key 形如 `<prefix>.<slug>`，prefix 可能含点（`rack.general`）——
 * 取「manifest 里能作为 key 前缀的最长库 id」。
 */
export async function ensureLibrariesForShapes(keys: Iterable<string>): Promise<number> {
  const wanted = [...keys].filter(Boolean);
  if (wanted.length === 0) return 0;
  await ensureStencilManifest();
  if (!manifest) return 0;

  const need = new Set<string>();
  for (const key of wanted) {
    let best: StencilLibrary | undefined;
    for (const lib of manifest) {
      if (key.startsWith(`${prefixOf(lib.id)}.`)) {
        if (!best || lib.id.length > best.id.length) best = lib;
      }
    }
    if (best && !loaded.has(best.id)) need.add(best.id);
  }
  if (need.size === 0) return 0;

  const libs = manifest.filter((l) => need.has(l.id));
  await Promise.all(libs.map(loadStencilLibrary));
  return libs.length;
}

export function listStencilShapes(libraryId?: string): StencilEntry[] {
  const all = [...registry.values()];
  return libraryId ? all.filter((s) => s.library === libraryId) : all;
}

export function findStencilShape(key: string): StencilEntry | undefined {
  return registry.get(key);
}

export function isLibraryLoaded(libraryId: string): boolean {
  return loaded.has(libraryId);
}
