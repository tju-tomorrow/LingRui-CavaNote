/**
 * Ghost 预览（ADR-0011 决策 5「三级保险」的视觉部分）
 *
 * 待确认的破坏类补丁，在画布上以虚线框标出「AI 想改哪一块」，
 * 并在旁边就地给出接受 / 忽略，不用回到聊天面板找。
 *
 * 实现选择：用 DOM 覆盖层而不是往 Excalidraw 场景里塞 ghost 元素。
 *   - 覆盖层不进场景 → 不会被 diffScene 当成受管元素、不会进 undo 栈、不会同步给别人
 *   - 靠 sceneCoordsToViewportCoords 跟随缩放/平移
 */
import { useMemo } from "react";
import { applyPending, type CanvasToolCall } from "@lingrui/ai";
import { ydoc } from "../collab/doc";
import { clearPending, resolvePending, usePendingPatches } from "../state/pending";
import { getCanvas, useCanvasVersion } from "./bridge";
import { nodeOverlayRect } from "./geometry";

/** 补丁指向的画布元素 id */
function targetElementId(call: CanvasToolCall): string | undefined {
  switch (call.name) {
    case "updateNode":
    case "moveNode":
    case "deleteNode":
    case "setStyle":
      return call.input.id;
    case "updateAnnotation":
    case "deleteAnnotation":
      return call.input.id;
    default:
      return undefined;
  }
}

export function GhostOverlay() {
  // 视口变了要重算坐标
  const canvasVersion = useCanvasVersion();
  const patches = usePendingPatches();

  const boxes = useMemo(() => {
    const api = getCanvas();
    if (!api || patches.length === 0) return [];

    return patches.flatMap((patch) => {
      const elementId = targetElementId(patch.call);
      if (!elementId) return [];

      // 节点 / 注释的 cell id 就是 Knowledge id（ADR-0013）
      const rect = nodeOverlayRect(elementId);
      if (!rect) return [];

      return [
        {
          patch,
          left: rect.left,
          top: rect.top,
          width: Math.max(rect.width, 40),
          height: Math.max(rect.height, 24),
        },
      ];
    });
  }, [patches, canvasVersion]);

  if (boxes.length === 0) return null;

  const accept = (patch: (typeof boxes)[number]["patch"]) => {
    applyPending({ doc: ydoc, t: 0 }, patch.call);
    resolvePending(patch.id);
  };

  return (
    <div className="ghost-layer">
      {boxes.map(({ patch, left, top, width, height }) => (
        <div
          key={patch.id}
          className={`ghost-box ghost-box-${patch.risk}`}
          style={{ left, top, width, height }}
        >
          <div className="ghost-tag">
            <span className="ghost-reason">{patch.reason}</span>
            <button type="button" className="ghost-btn" onClick={() => accept(patch)}>
              接受
            </button>
            <button type="button" className="ghost-btn" onClick={() => resolvePending(patch.id)}>
              忽略
            </button>
          </div>
        </div>
      ))}
      {boxes.length > 1 ? (
        <button
          type="button"
          className="ghost-all"
          onClick={() => {
            for (const { patch } of boxes) applyPending({ doc: ydoc, t: 0 }, patch.call);
            clearPending();
          }}
        >
          全部接受（{boxes.length}）
        </button>
      ) : null}
    </div>
  );
}
