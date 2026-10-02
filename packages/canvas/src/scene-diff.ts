/**
 * 画布增量 diff（ADR-0011 决策 2）
 *
 * 为什么需要：`convertToExcalidrawElements` 每次都会给标签文本元素生成**新的随机 id**，
 * 所以不能直接按 id 比较。这里引入两个概念：
 *
 *   identity  —— 元素在"逻辑上"是谁。容器的标签用 `label:<containerId>`，
 *                容器/箭头用自身的确定 id。
 *   signature —— 元素当前长什么样（内容指纹）。
 *
 * diff 规则：
 *   - 期望里有、当前没有 → 新增
 *   - identity 相同且 signature 相同 → **复用当前对象**（保住 id 与随机字段，最小改动）
 *   - identity 相同但 signature 变了 → 用新的替换
 *   - 当前有、期望没有，且是"我们的"元素 → 删除
 *   - 用户手绘（非 lingrui）→ 原样保留
 */
import { isLingRuiElement } from "./excalidraw-binding";

/** 只依赖我们真正用到的字段，避免把 Excalidraw 全量类型拖进来 */
export interface DiffableElement {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  containerId?: string | null;
  text?: string;
  customData?: unknown;
  startBinding?: { elementId?: string } | null;
  endBinding?: { elementId?: string } | null;
}

/** 逻辑身份：标签挂在容器上，其余用自己的 id */
export function elementIdentity(element: DiffableElement): string {
  return element.containerId ? `label:${element.containerId}` : element.id;
}

const round = (n: number) => Math.round(n);

/** 内容指纹：只包含会随 Knowledge 变化的部分 */
export function elementSignature(element: DiffableElement): string {
  if (element.type === "text") {
    return `t:${element.text ?? ""}:${round(element.x)},${round(element.y)}`;
  }
  if (element.type === "arrow") {
    return [
      "a",
      element.startBinding?.elementId ?? "",
      element.endBinding?.elementId ?? "",
      round(element.width),
      round(element.height),
    ].join(":");
  }
  return [
    "r",
    String((element.customData as { nodeId?: string } | undefined)?.nodeId ?? element.id),
    `${round(element.x)},${round(element.y)}`,
    `${round(element.width)}x${round(element.height)}`,
  ].join(":");
}

/**
 * 场景不变量检查（开发期用）。
 *
 * 为什么需要：Excalidraw 有一堆**沉默的不变量** —— 违反了不报错，只是「画不出来」。
 * 这次的 binding 断裂就是例子：容器指向不存在的标签 id，于是整张图的文字消失，
 * 控制台一行错都没有。类型系统管不了这种跨元素约束，只能靠断言。
 *
 * @returns 违反项（空 = 健康）
 */
export function checkSceneInvariants(elements: DiffableElement[]): string[] {
  const problems: string[] = [];
  const byId = new Map(elements.map((e) => [e.id, e]));

  for (const element of elements) {
    // 1) 容器 → 标签：boundElements 里的 text 必须真实存在，且反向指回来
    const bound = (element as { boundElements?: Array<{ id: string; type: string }> | null })
      .boundElements;
    for (const binding of bound ?? []) {
      if (binding.type !== "text") continue;
      const label = byId.get(binding.id);
      if (!label) {
        problems.push(`${element.id} 绑定的文本 ${binding.id} 不存在`);
      } else if (label.containerId !== element.id) {
        problems.push(`${element.id} → ${binding.id}，但后者指回 ${label.containerId}`);
      }
    }

    // 2) 标签 → 容器：containerId 必须真实存在（否则文字不会渲染）
    if (element.containerId && !byId.has(element.containerId)) {
      problems.push(`文本 ${element.id} 的容器 ${element.containerId} 不存在`);
    }

    // 3) 坐标不能是 NaN（画布会直接吞掉这类元素）
    if (!Number.isFinite(element.x) || !Number.isFinite(element.y)) {
      problems.push(`${element.id} 坐标非法：${element.x},${element.y}`);
    }
  }

  return problems;
}

export interface DiffResult<T extends DiffableElement> {
  /** 可以直接交给 updateScene 的元素列表 */
  elements: T[];
  stats: { added: number; changed: number; reused: number; removed: number; foreign: number };
}

/**
 * 计算从 current 到 desired 的最小改动。
 * 返回值中的元素对象在"未变"时会**直接复用 current 里的实例**。
 */
export function diffScene<T extends DiffableElement>(current: T[], desired: T[]): DiffResult<T> {
  const currentByIdentity = new Map<string, T>();
  for (const element of current) {
    if (isLingRuiElement(element)) currentByIdentity.set(elementIdentity(element), element);
  }

  const elements: T[] = [];
  const stats = { added: 0, changed: 0, reused: 0, removed: 0, foreign: 0 };
  const keptIdentities = new Set<string>();

  for (const wanted of desired) {
    const identity = elementIdentity(wanted);
    keptIdentities.add(identity);

    const previous = currentByIdentity.get(identity);
    if (previous && elementSignature(previous) === elementSignature(wanted)) {
      elements.push(previous); // 复用：id 与随机字段都不变
      stats.reused += 1;
      continue;
    }
    elements.push(wanted);
    if (previous) stats.changed += 1;
    else stats.added += 1;
  }

  // ---- 容器 ↔ 标签重新绑定 ----
  //
  // Excalidraw 只通过容器的 `boundElements` 找绑定文本：容器指向哪个 text id，就渲染哪个。
  // 但 `convertToExcalidrawElements` 每次都会给标签**生成新的随机 id**，
  // 而容器往往因为签名没变而被**复用**（带着旧的 boundElements）。
  // 于是「只改了文字、没改位置」时：标签被换成新 id，容器还指着旧 id
  //   → Excalidraw 找不到绑定文本 → **文字整个不渲染**（框还在、字没了）。
  //
  // 实测：给所有标签加 emoji 前缀后，整张图的文字全部消失。
  // 这里在输出列表上强制重绑，保证容器指向的是真正在列表里的那个标签。
  const labelIdByContainer = new Map<string, string>();
  for (const element of elements) {
    if (element.containerId) labelIdByContainer.set(element.containerId, element.id);
  }
  for (let i = 0; i < elements.length; i += 1) {
    const element = elements[i]!;
    const labelId = labelIdByContainer.get(element.id);
    if (!labelId) continue;
    const bound = (element as { boundElements?: Array<{ id: string; type: string }> | null })
      .boundElements;
    if (!Array.isArray(bound)) continue;
    const needsFix = bound.some((b) => b.type === "text" && b.id !== labelId);
    if (!needsFix) continue;
    // 复制一份再改：直接改会动到 Excalidraw 场景里的同一个对象实例
    elements[i] = {
      ...element,
      boundElements: bound.map((b) => (b.type === "text" ? { ...b, id: labelId } : b)),
    } as T;
  }

  for (const identity of currentByIdentity.keys()) {
    if (!keptIdentities.has(identity)) stats.removed += 1;
  }

  // 用户手绘原样保留
  for (const element of current) {
    if (!isLingRuiElement(element)) {
      elements.push(element);
      stats.foreign += 1;
    }
  }

  return { elements, stats };
}
