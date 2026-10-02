/**
 * maxGraph 引擎适配层（ADR-0013）
 *
 * maxGraph 是命令式的、非 React 的：它拥有自己的 model / view / SVG。
 * 这一层把它的 API 收敛成一个小而稳定的接口，React 侧（MxStage）只负责
 * 「挂载 / 销毁 / 喂 GraphSpec / 订阅事件」，其余组件（覆盖层、截图、录屏）
 * 都通过这个接口访问画布，不再直接依赖具体引擎。
 *
 * 不变量：cell id 就是 Knowledge id（节点 = nodeId，边 = `edge-<relationId>`），
 * 所以 AI / 覆盖层 / 快照都能按 id 精确寻址（ADR-0011）。
 */
import {
  Graph,
  Geometry,
  HierarchicalLayout,
  InternalEvent,
  Point,
  type Cell,
  type CellStyle,
} from "@maxgraph/core";
import type { AnnotationSpec } from "./annotation-binding";
import { registerDeviceShapes } from "./device-shapes";
import type { GraphSpec } from "./mxgraph-binding";

export interface CanvasElementLike {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  isEdge: boolean;
  /** 注释 cell（无 nodeId） */
  isAnnotation?: boolean;
  customData?: { nodeId?: string } | undefined;
}

export interface Viewport {
  scrollX: number;
  scrollY: number;
  zoom: number;
  width: number;
  height: number;
}

interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface EngineCallbacks {
  /** 拖动结束：把新位置写回 layout 并标 provenance=human */
  onNodeMoved?: (nodeId: string, x: number, y: number) => void;
  /** 选中变化：更新 focus / 面板（多选） */
  onSelectionChanged?: (nodeIds: string[]) => void;
  /** 视口或场景变化：覆盖层据此重算坐标 */
  onViewportChanged?: () => void;
}

/** 我们创建的 cell id 集合；非本集合的 cell 视作外来内容，不动它 */
type AnyCell = Cell;

/** maxGraph Rectangle → 纯 bounds（它内部字段是 `_x`，也提供 getter） */
function toBounds(rect: {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  _x?: number;
  _y?: number;
  _width?: number;
  _height?: number;
}): Bounds {
  return {
    x: rect.x ?? rect._x ?? 0,
    y: rect.y ?? rect._y ?? 0,
    width: rect.width ?? rect._width ?? 0,
    height: rect.height ?? rect._height ?? 0,
  };
}

/** 期望图里所有顶点的包围盒；无边则返回 null */
function boundsOfSpec(spec: GraphSpec): Bounds | null {
  if (spec.vertices.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const vertex of spec.vertices) {
    minX = Math.min(minX, vertex.x);
    minY = Math.min(minY, vertex.y);
    maxX = Math.max(maxX, vertex.x + vertex.width);
    maxY = Math.max(maxY, vertex.y + vertex.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export class GraphEngine {
  private readonly graph: Graph;
  private readonly ours = new Set<string>();
  private readonly annotationIds = new Set<string>();
  private readonly callbacks: EngineCallbacks;
  private wheelHost: HTMLElement;
  private readonly onWheel: (event: WheelEvent) => void;
  /** 平移会话（中键 / 右键 / 抓手模式共用） */
  private panState: { pointerId: number; startX: number; startY: number; baseX: number; baseY: number } | null = null;
  private panTool = false;
  private readonly onPointerDown: (event: PointerEvent) => void;
  private readonly onPointerMove: (event: PointerEvent) => void;
  private readonly onPointerUp: (event: PointerEvent) => void;
  private readonly onContextMenu: (event: MouseEvent) => void;
  private readonly onDoubleClick: (event: MouseEvent) => void;
  /** 由期望图算出的内容包围盒（不依赖 view 是否已完成布局） */
  private specBounds: Bounds | null = null;

  constructor(
    private readonly container: HTMLElement,
    callbacks: EngineCallbacks = {},
  ) {
    this.callbacks = callbacks;
    // 画布上方的工具捕获层（✋ 等）会截走事件，wheel 必须挂在容器父级才能
    // 同时收到「普通模式 / 抓手模式」下的滚动与触控板捏合
    this.wheelHost = container.parentElement ?? container;
    this.graph = new Graph(container);
    // 注册自定义设备形状（服务器/机架）——Graph 构造只注册内置形状
    registerDeviceShapes();

    const graph = this.graph;
    graph.setHtmlLabels(false);
    // 只允许「拖动节点」，其余编辑动作交给 AI / 面板，避免用户误建游离图元
    graph.setCellsEditable(false);
    graph.setCellsResizable(false);
    graph.setCellsMovable(true);
    graph.setCellsDisconnectable(false);
    graph.setConnectable(false);
    graph.setDropEnabled(false);
    graph.setSplitEnabled(false);
    graph.setTooltips(false);
    graph.setGridEnabled(false);
    graph.setAutoSizeCells(false);
    graph.setPanning(true);
    graph.setEnabled(true);

    this.bindEvents();

    // 滚轮导航：普通滚动 = 平移画布，⌘/Ctrl + 滚动（或触控板捏合）= 缩放。
    // maxGraph 不自带 wheel 绑定，这里按需分派，避免「一滚就缩放」把内容甩丢。
    this.onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const view = this.graph.getView();
      if (event.ctrlKey || event.metaKey) {
        const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
        this.graph.zoom(factor, true);
      } else {
        const scale = view.getScale();
        const t = view.getTranslate();
        // Shift + 滚轮 = 水平平移；否则 dx/dy 跟随手势/滚轮方向
        const dx = event.shiftKey ? event.deltaY : event.deltaX;
        const dy = event.shiftKey ? 0 : event.deltaY;
        view.setTranslate(t.x + dx / scale, t.y + dy / scale);
      }
      this.callbacks.onViewportChanged?.();
    };
    this.wheelHost.addEventListener("wheel", this.onWheel, { passive: false });

    // 中键 / 右键拖拽 = 平移（类 draw.io 桌面版习惯）
    this.onPointerDown = (event: PointerEvent) => {
      if (this.panState) return;
      if (event.button !== 1 && event.button !== 2) return;
      event.preventDefault();
      if (this.beginPan(event.clientX, event.clientY)) {
        this.panState!.pointerId = event.pointerId;
        this.container.setPointerCapture?.(event.pointerId);
      }
    };
    this.onPointerMove = (event: PointerEvent) => {
      if (!this.panState || event.pointerId !== this.panState.pointerId) return;
      this.panTo(event.clientX, event.clientY);
    };
    this.onPointerUp = (event: PointerEvent) => {
      if (!this.panState || event.pointerId !== this.panState.pointerId) return;
      this.endPan();
    };
    this.onContextMenu = (event: MouseEvent) => {
      // 右键已被用于平移，画布内不弹系统菜单
      event.preventDefault();
    };
    // 双击空白处 = 重置视图（滚远 / 缩糊涂了随时回正）;
    // 用引擎自身的命中测试判断空白：点在节点上才不复位（maxGraph 背景 rect 不算内容）
    this.onDoubleClick = (event: MouseEvent) => {
      if (!this.specBounds) return;
      const scene = this.containerToScene(event.clientX, event.clientY);
      if (this.nodeAt(scene.x, scene.y)) return;
      this.fitToContent();
    };
    container.addEventListener("pointerdown", this.onPointerDown);
    container.addEventListener("pointermove", this.onPointerMove);
    container.addEventListener("pointerup", this.onPointerUp);
    container.addEventListener("pointercancel", this.onPointerUp);
    container.addEventListener("contextmenu", this.onContextMenu);
    container.addEventListener("dblclick", this.onDoubleClick);
  }

  private bindEvents(): void {
    const graph = this.graph;

    graph.addListener(InternalEvent.CELLS_MOVED, (_sender: unknown, evt: { getProperty(k: string): unknown }) => {
      const cells = (evt.getProperty("cells") as AnyCell[] | undefined) ?? [];
      for (const cell of cells) {
        const id = cell.getId();
        const geo = cell.getGeometry();
        if (!id || !geo || cell.isEdge()) continue;
        this.callbacks.onNodeMoved?.(id, geo.x, geo.y);
      }
      this.callbacks.onViewportChanged?.();
    });

    graph.addListener(InternalEvent.CHANGE, () => {
      this.callbacks.onViewportChanged?.();
    });

    graph.getSelectionModel().addListener(InternalEvent.CHANGE, () => {
      this.callbacks.onSelectionChanged?.(this.selectedNodeIds());
    });
  }

  /**
   * 把期望图同步进 maxGraph model（等价于旧 scene-diff 的增量 patch）。
   * 按 id upsert，删除我们创建但不再期望的 cell，外来 cell 原样保留。
   */
  render(spec: GraphSpec): void {
    this.specBounds = boundsOfSpec(spec);
    const graph = this.graph;
    const model = graph.getDataModel();
    const parent = graph.getDefaultParent();
    const desired = new Set<string>([
      ...spec.vertices.map((v) => v.id),
      ...spec.edges.map((e) => e.id),
    ]);

    model.beginUpdate();
    try {
      for (const id of [...this.ours]) {
        if (desired.has(id)) continue;
        const cell = model.getCell(id);
        if (cell) model.remove(cell);
        this.ours.delete(id);
        this.annotationIds.delete(id);
      }

      for (const vertex of spec.vertices) {
        const existing = model.getCell(vertex.id);
        if (!existing) {
          graph.insertVertex({
            id: vertex.id,
            parent,
            value: vertex.label,
            x: vertex.x,
            y: vertex.y,
            width: vertex.width,
            height: vertex.height,
            style: vertex.style as CellStyle,
          });
          this.ours.add(vertex.id);
        } else {
          model.setValue(existing, vertex.label);
          model.setStyle(existing, vertex.style as CellStyle);
          model.setGeometry(
            existing,
            new Geometry(vertex.x, vertex.y, vertex.width, vertex.height),
          );
        }
      }

      for (const edge of spec.edges) {
        const source = model.getCell(edge.source);
        const target = model.getCell(edge.target);
        if (!source || !target) continue;
        const existing = model.getCell(edge.id);
        if (!existing) {
          graph.insertEdge({
            id: edge.id,
            parent,
            value: edge.label ?? "",
            source,
            target,
            style: edge.style as CellStyle,
          });
          this.ours.add(edge.id);
        } else {
          model.setValue(existing, edge.label ?? "");
          model.setStyle(existing, edge.style as CellStyle);
          model.setTerminals(existing, source, target);
        }
      }
      for (const annotation of spec.annotations) {
        this.upsertAnnotation(model, parent, annotation);
      }
    } finally {
      model.endUpdate();
    }
  }

  /** 注释：便签/文本/高亮/形状是顶点；手绘/箭头是无端点的浮动折线 */
  private upsertAnnotation(
    model: ReturnType<Graph["getDataModel"]>,
    parent: Cell,
    spec: AnnotationSpec,
  ): void {
    if (spec.kind === "vertex") {
      const existing = model.getCell(spec.id);
      if (!existing) {
        this.graph.insertVertex({
          id: spec.id,
          parent,
          value: spec.value ?? "",
          x: spec.x,
          y: spec.y,
          width: Math.max(1, spec.width),
          height: Math.max(1, spec.height),
          style: spec.style as CellStyle,
        });
      } else {
        model.setValue(existing, spec.value ?? "");
        model.setStyle(existing, spec.style as CellStyle);
        model.setGeometry(
          existing,
          new Geometry(spec.x, spec.y, Math.max(1, spec.width), Math.max(1, spec.height)),
        );
      }
      this.ours.add(spec.id);
      this.annotationIds.add(spec.id);
      return;
    }

    // 浮动折线：无 source/target，靠 sourcePoint/targetPoint + points 定位
    const geometry = (): Geometry => {
      const pts = spec.points ?? [
        [spec.x, spec.y],
        [spec.x + spec.width, spec.y + spec.height],
      ];
      const first = pts[0]!;
      const last = pts[pts.length - 1]!;
      const geo = new Geometry(spec.x, spec.y, spec.width, spec.height);
      geo.sourcePoint = new Point(first[0], first[1]);
      geo.targetPoint = new Point(last[0], last[1]);
      geo.points = pts.slice(1, -1).map(([px, py]) => new Point(px, py));
      return geo;
    };

    const existing = model.getCell(spec.id);
    if (!existing) {
      this.graph.insertEdge({
        id: spec.id,
        parent,
        value: "",
        source: null,
        target: null,
        style: spec.style as CellStyle,
      });
      model.setGeometry(model.getCell(spec.id)!, geometry());
    } else {
      model.setStyle(existing, spec.style as CellStyle);
      model.setGeometry(existing, geometry());
    }
    this.ours.add(spec.id);
    this.annotationIds.add(spec.id);
  }

  /** 只读分享视图：禁掉拖动，但保留平移/缩放 */
  setMovable(value: boolean): void {
    this.graph.setCellsMovable(value);
  }

  /** 抓手模式：开启后左键拖动 = 平移画布（配合上层 capture 层调用） */
  setPanTool(on: boolean): void {
    this.panTool = on;
    this.container.style.cursor = on ? "grab" : "";
  }

  isPanning(): boolean {
    return this.panState !== null;
  }

  /** 以容器 client 坐标开始一次平移（中键 / 右键 / 抓手模式共用一条链路）；返回是否新建会话 */
  beginPan(clientX: number, clientY: number): boolean {
    if (this.panState) return false;
    const t = this.graph.getView().getTranslate();
    this.panState = { pointerId: -1, startX: clientX, startY: clientY, baseX: t.x, baseY: t.y };
    // 平移期间禁用引擎交互，避免节点被带飞 / 出现框选
    this.graph.setEnabled(false);
    this.container.style.cursor = "grabbing";
    return true;
  }

  /** 平移进行中（client 坐标 → 换算场景位移） */
  panTo(clientX: number, clientY: number): void {
    const p = this.panState;
    if (!p) return;
    const view = this.graph.getView();
    const scale = view.getScale();
    view.setTranslate(
      p.baseX + (clientX - p.startX) / scale,
      p.baseY + (clientY - p.startY) / scale,
    );
    this.callbacks.onViewportChanged?.();
  }

  /** 结束平移，恢复引擎交互 */
  endPan(): void {
    if (!this.panState) return;
    this.panState = null;
    this.graph.setEnabled(true);
    this.container.style.cursor = this.panTool ? "grab" : "";
    this.callbacks.onViewportChanged?.();
  }

  /** 场景元素（供覆盖层 / 快照 / 截图用；几何为场景坐标） */
  elements(): CanvasElementLike[] {
    const model = this.graph.getDataModel();
    const out: CanvasElementLike[] = [];
    for (const id of this.ours) {
      const cell = model.getCell(id);
      const geo = cell?.getGeometry();
      if (!cell || !geo) continue;
      const isEdge = cell.isEdge();
      const isAnnotation = this.annotationIds.has(id);
      out.push({
        id,
        x: geo.x,
        y: geo.y,
        width: geo.width,
        height: geo.height,
        isEdge,
        isAnnotation,
        customData: isEdge || isAnnotation ? { kind: "relation" } as never : { nodeId: id },
      });
    }
    return out;
  }

  viewport(): Viewport {
    const view = this.graph.getView();
    const translate = view.getTranslate();
    return {
      scrollX: translate.x,
      scrollY: translate.y,
      zoom: view.getScale(),
      width: this.container.clientWidth,
      height: this.container.clientHeight,
    };
  }

  /** 场景坐标 → 容器坐标（覆盖层用） */
  sceneToContainer(x: number, y: number): { x: number; y: number } {
    const view = this.graph.getView();
    const translate = view.getTranslate();
    const scale = view.getScale();
    return { x: x * scale + translate.x, y: y * scale + translate.y };
  }

  /** 容器坐标（含 client 偏移）→ 场景坐标（画笔落点用） */
  containerToScene(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.container.getBoundingClientRect();
    const view = this.graph.getView();
    const translate = view.getTranslate();
    const scale = view.getScale();
    return {
      x: (clientX - rect.left - translate.x) / scale,
      y: (clientY - rect.top - translate.y) / scale,
    };
  }

  /** 命中测试：返回某点下方的 Knowledge 节点 id（注释不算） */
  nodeAt(sceneX: number, sceneY: number): string | undefined {
    const model = this.graph.getDataModel();
    for (const id of this.ours) {
      if (this.annotationIds.has(id)) continue;
      const cell = model.getCell(id);
      if (!cell || cell.isEdge()) continue;
      const geo = cell.getGeometry();
      if (!geo) continue;
      if (
        sceneX >= geo.x &&
        sceneX <= geo.x + geo.width &&
        sceneY >= geo.y &&
        sceneY <= geo.y + geo.height
      ) {
        return id;
      }
    }
    return undefined;
  }

  /** 当前选中的 Knowledge 节点 id（多选，排除注释与边） */
  selectedNodeIds(): string[] {
    const cells = this.graph.getSelectionCells() as AnyCell[];
    return cells
      .map((cell) => cell.getId())
      .filter((id): id is string => Boolean(id) && !this.annotationIds.has(id!));
  }

  /**
   * 层级自动布局（maxGraph 内置 HierarchicalLayout）。
   * 布局直接改 model 几何；调用方随后把新坐标写回 Y.Doc 的 layout。
   */
  autoLayout(): void {
    const layout = new HierarchicalLayout(this.graph, "east");
    layout.execute(this.graph.getDefaultParent());
    this.graph.getView().revalidate();
    this.callbacks.onViewportChanged?.();
  }

  /** 节点矩形（容器坐标）；找不到返回 null */
  nodeRect(nodeId: string): { left: number; top: number; width: number; height: number } | null {
    const geo = this.graph.getDataModel().getCell(nodeId)?.getGeometry();
    if (!geo) return null;
    const topLeft = this.sceneToContainer(geo.x, geo.y);
    const scale = this.graph.getView().getScale();
    return {
      left: topLeft.x,
      top: topLeft.y,
      width: geo.width * scale,
      height: geo.height * scale,
    };
  }

  /** 整幅自适应（首次挂载 / AI 新增节点后）；返回是否真的完成了 fit */
  fitToContent(): boolean {
    // 优先用「期望图」的包围盒：getGraphBounds() 依赖 view 是否已完成布局，
    // 挂载后两帧内常常还是空的，会导致首次 fit 落空。
    const raw = this.specBounds ?? toBounds(this.graph.getGraphBounds());
    // 给正交连线/标签留出外扩空间，避免被裁
    const margin = 40;
    const bounds: Bounds = {
      x: raw.x - margin,
      y: raw.y - margin,
      width: raw.width + margin * 2,
      height: raw.height + margin * 2,
    };
    if (!(bounds.width > 0) || !(bounds.height > 0)) return false;
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (width < 40 || height < 40) return false;
    const pad = 56;
    const scale = Math.min(
      (width - pad * 2) / bounds.width,
      (height - pad * 2) / bounds.height,
      1.4,
    );
    const view = this.graph.getView();
    view.setScale(scale);
    view.setTranslate(
      (width - bounds.width * scale) / 2 - bounds.x * scale,
      (height - bounds.height * scale) / 2 - bounds.y * scale,
    );
    view.revalidate();
    this.callbacks.onViewportChanged?.();
    return true;
  }

  /** 把某个节点居中（演出镜头跟随） */
  centerOn(nodeId: string): void {
    const geo = this.graph.getDataModel().getCell(nodeId)?.getGeometry();
    if (!geo) return;
    const view = this.graph.getView();
    const scale = view.getScale();
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    view.setTranslate(
      (width - geo.width * scale) / 2 - geo.x * scale,
      (height - geo.height * scale) / 2 - geo.y * scale,
    );
    this.callbacks.onViewportChanged?.();
  }

  /** 渲染出的 SVG 根（截图序列化用） */
  svg(): SVGSVGElement | null {
    return this.container.querySelector("svg");
  }

  destroy(): void {
    this.wheelHost.removeEventListener("wheel", this.onWheel);
    this.container.removeEventListener("pointerdown", this.onPointerDown);
    this.container.removeEventListener("pointermove", this.onPointerMove);
    this.container.removeEventListener("pointerup", this.onPointerUp);
    this.container.removeEventListener("pointercancel", this.onPointerUp);
    this.container.removeEventListener("contextmenu", this.onContextMenu);
    this.container.removeEventListener("dblclick", this.onDoubleClick);
    this.graph.destroy();
    this.container.replaceChildren();
  }
}
