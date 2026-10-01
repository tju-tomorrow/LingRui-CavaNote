/**
 * Personal Pet 覆盖层（见 PRD/宠物.md）
 *
 * 自包含：不依赖 CanvasStage / 时间轴。挂载时确保有一只是当前宠物（默认灵睿），
 * 用 rAF 驱动像素宠物；画布聚焦某节点时，宠物指向并讲解。
 *
 * 只读 `collab/doc` 的 ydoc，不改动它。
 */
import { useEffect, useRef, useState, type JSX } from "react";
import { createPixelPet, type PixelPetController } from "@lingrui/mascot";
import { ensureDefaultPet, getActivePet, getPets, type PetSpec } from "@lingrui/knowledge";
import { ydoc } from "../collab/doc";
import { useFocus } from "../state/focus";

/** 订阅当前激活宠物（Y.Doc pet root） */
function useActivePet(): PetSpec | undefined {
  const [pet, setPet] = useState<PetSpec | undefined>(() => getActivePet(ydoc));

  useEffect(() => {
    ensureDefaultPet(ydoc);
    const update = () => setPet(getActivePet(ydoc));
    update();
    const pets = getPets(ydoc);
    pets.observe(update);
    return () => pets.unobserve(update);
  }, []);

  return pet;
}

export function PetLayer(): JSX.Element | null {
  const pet = useActivePet();
  const focus = useFocus();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const controllerRef = useRef<PixelPetController | null>(null);

  // 建立控制器 + rAF 驱动（组件 unmount / 换宠时重建）
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !pet) return;

    const controller = createPixelPet(canvas, pet);
    controllerRef.current = controller;

    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      controller.tick(dt);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      controller.dispose();
      controllerRef.current = null;
    };
  }, [pet]);

  // 聚焦知识节点 → 宠物指向并讲解
  useEffect(() => {
    const controller = controllerRef.current;
    if (!controller || !focus) return;
    controller.setState("point");
    const timer = setTimeout(() => controller.setState("explain"), 1200);
    return () => clearTimeout(timer);
  }, [focus]);

  if (!pet || pet.form !== "pixel") return null;

  return (
    <div
      className="pet-layer"
      style={{
        position: "fixed",
        right: 20,
        bottom: 84,
        zIndex: 20,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 6,
        pointerEvents: "none",
        userSelect: "none",
      }}
    >
      {focus ? (
        <div
          style={{
            background: "#1e1e1e",
            color: "#fff",
            fontSize: 12,
            padding: "4px 8px",
            borderRadius: 999,
            whiteSpace: "nowrap",
          }}
        >
          我来讲解这条链路 →
        </div>
      ) : null}
      <canvas ref={canvasRef} />
      <span style={{ fontSize: 11, color: "#8a8a8a" }}>{pet.name}</span>
    </div>
  );
}
