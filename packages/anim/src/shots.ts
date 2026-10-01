/**
 * 分镜（Shot）—— 从动作流推导「章节」，给时间轴缩略图用（见 PRD/演出层.md §4）
 *
 * 规则：一个节点**首次**被 spawn / focus / 宠物走向时，开启一个新分镜。
 * 这是确定性推导；P3 由 AI 按讲解章节切分后可覆盖。
 */
import type { Action } from "./scene";

export interface Shot {
  id: string;
  title: string;
  /** 该分镜在时间轴上的起始秒 */
  startT: number;
}

const SHOT_KINDS: ReadonlySet<Action["kind"]> = new Set<Action["kind"]>([
  "node.spawn",
  "node.focus",
  "pet.moveTo",
  "pet.teach",
  "mascot.moveTo",
]);

export function deriveShots(
  actions: Action[],
  titleOf?: (nodeId: string) => string | undefined,
): Shot[] {
  const sorted = [...actions].sort((a, b) => a.t - b.t);
  const seen = new Set<string>();
  const shots: Shot[] = [];

  for (const a of sorted) {
    if (!SHOT_KINDS.has(a.kind)) continue;
    const nodeId = "nodeId" in a ? a.nodeId : undefined;
    if (!nodeId || seen.has(nodeId)) continue;
    seen.add(nodeId);
    shots.push({ id: `shot-${nodeId}`, title: titleOf?.(nodeId) ?? nodeId, startT: a.t });
  }

  return shots;
}

/** 当前时间落在哪个分镜（用于高亮） */
export function shotAt(shots: Shot[], t: number): Shot | undefined {
  let current: Shot | undefined;
  for (const s of shots) {
    if (s.startT <= t + 1e-3) current = s;
    else break;
  }
  return current;
}
