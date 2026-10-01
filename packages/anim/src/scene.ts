/**
 * @lingrui/anim — SceneScript：动画的唯一输入格式
 *
 * 关键设计：SceneScript 是**纯数据**，不含渲染代码。
 *   - 实时播放：PixiJS 消费采样结果（可暂停 / 快进 / 点节点追问）
 *   - 视频导出：Revideo 消费同一份 SceneScript
 *
 * 因此播放器状态必须是时间的纯函数：f(t) -> SceneState。
 * 禁止在渲染回调里写共享状态。
 */

export type MascotState = "idle" | "run" | "talk" | "point" | "think";

export type Action =
  | { t: number; kind: "node.spawn"; nodeId: string; at: Vec2 }
  | { t: number; kind: "node.focus"; nodeId: string }
  | { t: number; kind: "node.state"; nodeId: string; to: string }
  | { t: number; kind: "edge.connect"; from: string; to: string; label?: string }
  | { t: number; kind: "flow.send"; from: string; to: string; label?: string }
  | { t: number; kind: "mascot.moveTo"; nodeId: string; state?: MascotState }
  | { t: number; kind: "mascot.say"; text: string }
  | { t: number; kind: "camera.pan"; to: Vec2; zoom?: number };

export type Vec2 = readonly [number, number];

export interface SceneScript {
  id: string;
  title: string;
  duration: number;
  actions: Action[];
}

export interface SceneState {
  t: number;
  nodes: Map<string, NodeVisual>;
  edges: Map<string, EdgeVisual>;
  flows: FlowVisual[];
  mascot: { at: Vec2; state: MascotState };
  camera: { at: Vec2; zoom: number };
  focus: string | null;
  narration: { nodeId: string | null; text: string } | null;
}

export interface NodeVisual {
  nodeId: string;
  at: Vec2;
  /** 0→1 出现进度 */
  appear: number;
  state?: string;
}

export interface EdgeVisual {
  from: string;
  to: string;
  /** 0→1 描线进度 */
  draw: number;
  label?: string;
}

export interface FlowVisual {
  from: string;
  to: string;
  /** 0→1 数据包位置 */
  progress: number;
  label?: string;
}

/** 每条动作的默认演出时长（秒） */
export const DURATION = {
  spawn: 0.4,
  connect: 0.5,
  flow: 0.8,
  camera: 0.6,
  move: 0.9,
} as const;

export const easeOutCubic = (x: number): number => 1 - Math.pow(1 - clamp01(x), 3);
export const easeInOutQuad = (x: number): number => {
  const c = clamp01(x);
  return c < 0.5 ? 2 * c * c : 1 - Math.pow(-2 * c + 2, 2) / 2;
};
export const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

/**
 * 核心：把 SceneScript 采样成某一时刻的场景状态。
 * 纯函数，无副作用 —— 这是 seek / 回放 / 单元测试的基础。
 */
export function sampleAt(script: SceneScript, t: number): SceneState {
  const actions = [...script.actions].sort((a, b) => a.t - b.t);

  const state: SceneState = {
    t,
    nodes: new Map(),
    edges: new Map(),
    flows: [],
    mascot: { at: [0, 0], state: "idle" },
    camera: { at: [0, 0], zoom: 1 },
    focus: null,
    narration: null,
  };

  for (const a of actions) {
    if (a.t > t) break;
    const local = t - a.t;

    switch (a.kind) {
      case "node.spawn":
        state.nodes.set(a.nodeId, {
          nodeId: a.nodeId,
          at: a.at,
          appear: easeOutCubic(local / DURATION.spawn),
        });
        break;

      case "node.state": {
        const n = state.nodes.get(a.nodeId);
        if (n) n.state = a.to;
        break;
      }

      case "edge.connect":
        state.edges.set(`${a.from}->${a.to}`, {
          from: a.from,
          to: a.to,
          draw: easeInOutQuad(local / DURATION.connect),
          label: a.label,
        });
        break;

      case "flow.send": {
        const p = clamp01(local / DURATION.flow);
        if (p < 1) state.flows.push({ from: a.from, to: a.to, progress: p, label: a.label });
        break;
      }

      case "mascot.moveTo": {
        const target = state.nodes.get(a.nodeId)?.at ?? state.mascot.at;
        const p = easeInOutQuad(local / DURATION.move);
        state.mascot.at = [lerp(state.mascot.at[0], target[0], p), lerp(state.mascot.at[1], target[1], p)];
        state.mascot.state = local < DURATION.move ? (a.state ?? "run") : "idle";
        break;
      }

      case "mascot.say":
        state.mascot.state = "talk";
        state.narration = { nodeId: state.focus, text: a.text };
        break;

      case "node.focus":
        state.focus = a.nodeId;
        break;

      case "camera.pan":
        state.camera = { at: a.to, zoom: a.zoom ?? state.camera.zoom };
        break;
    }
  }

  return state;
}

function lerp(a: number, b: number, p: number): number {
  return a + (b - a) * clamp01(p);
}

/** 给时间轴 UI 用的缩略图刻度 */
export function keyframes(script: SceneScript): number[] {
  return [...script.actions].map((a) => a.t).sort((x, y) => x - y);
}
