/**
 * @lingrui/mascot — VRM 3D 动漫吉祥物
 *
 * 见 ADR-0004。技术栈：three + @pixiv/three-vrm + three-vrm-animation。
 *
 * 注意：「动漫感」主要来自美术资产（VRoid 模型 + 动作/表情），
 * 本模块只负责加载、状态机、口型与位置驱动。
 */
import type { MascotState, Vec2 } from "@lingrui/anim";

export type { MascotState };

export interface MascotController {
  /** 加载 .vrm 资源 */
  load(url: string | ArrayBuffer): Promise<void>;
  /** 每帧推进（由 app 的 rAF 统一驱动，不自己起循环） */
  update(deltaSeconds: number): void;
  /** 状态机切换，内部做 crossfade */
  setState(state: MascotState): void;
  /** 平移到画布坐标（画布坐标 → 世界坐标的换算由 canvas 层提供） */
  moveTo(at: Vec2): void;
  /** 播放一次性表情（VRM expression preset） */
  expression(name: string, weight?: number, duration?: number): void;
  /** 口型：用音频包络驱动 aa/ih/ou/ee/oh */
  setViseme(name: "aa" | "ih" | "ou" | "ee" | "oh", weight: number): void;
  dispose(): void;
}

/** 状态 → 动画 clip 名。资产到位后填真实名字。 */
export const STATE_TO_CLIP: Record<MascotState, string> = {
  idle: "Idle",
  run: "Run",
  talk: "Talk",
  point: "Point",
  think: "Think",
};

/** 状态 → 期望移动速度（画布单位/秒），供控制器做位移插值 */
export const STATE_SPEED: Record<MascotState, number> = {
  idle: 0,
  run: 320,
  talk: 0,
  point: 0,
  think: 0,
};

export const VRM_ASSETS = {
  model: "/mascot/lingrui.vrm",
  animations: {
    Idle: "/mascot/anims/idle.vrma",
    Run: "/mascot/anims/run.vrma",
    Talk: "/mascot/anims/talk.vrma",
    Point: "/mascot/anims/point.vrma",
    Think: "/mascot/anims/think.vrma",
  },
} as const;

/**
 * ⚠️ VRM 形态**未实现**（原会抛错的 `createMascotController` 已移除）。
 *
 * 当前生效的宠物实现是**像素形态**：`pixel.ts`（帧生成）+ `pet.ts`（控制器）。
 * 上面的接口/常量保留作接入 VRM 时的规格参考（见 ADR-0004、PRD/宠物.md）。
 */
