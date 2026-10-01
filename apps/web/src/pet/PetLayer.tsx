/**
 * Personal Pet 覆盖层（见 PRD/宠物.md）
 *
 * 两种驱动：
 *   1. 有演出（时间轴已装载）→ 由 `state/player` 驱动：状态 / 旁白 / 位移
 *   2. 无演出 → 画布聚焦节点时，指向并讲解
 *
 * 只读 `collab/doc` 的 ydoc，不改动它。
 */
import { useEffect, useRef, useState, type JSX } from "react";
import { createPixelPet, type PixelPetController } from "@lingrui/mascot";
import { ensureDefaultPet, getActivePet, getActivePetMap, getPets, type PetSpec } from "@lingrui/knowledge";
import { ydoc } from "../collab/doc";
import { useFocus } from "../state/focus";
import { getPlayerState, subscribePlayer } from "../state/player";

/** 订阅当前激活宠物（Y.Doc pet root） */
function useActivePet(): PetSpec | undefined {
  const [pet, setPet] = useState<PetSpec | undefined>(() => getActivePet(ydoc));

  useEffect(() => {
    ensureDefaultPet(ydoc);
    const update = () => setPet(getActivePet(ydoc));
    update();
    const pets = getPets(ydoc);
    const active = getActivePetMap(ydoc);
    pets.observe(update);
    active.observe(update);
    return () => {
      pets.unobserve(update);
      active.unobserve(update);
    };
  }, []);

  return pet;
}

export function PetLayer(): JSX.Element | null {
  const pet = useActivePet();
  const focus = useFocus();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<PixelPetController | null>(null);
  const narrationRef = useRef<string | null>(null);
  const [narration, setNarration] = useState<string | null>(null);
  /** 演出中（旁白由字幕条负责，宠物不再重复） */
  const [performing, setPerforming] = useState(false);

  // 建立控制器 + rAF 渲染（组件 unmount / 换宠时重建）
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

  // 演出驱动：状态 / 旁白 / 位移（命令式订阅，逐帧不触发 React 重渲染）
  useEffect(() => {
    return subscribePlayer(() => {
      const s = getPlayerState();
      const controller = controllerRef.current;
      if (!controller || !s.snapshot) return;

      controller.setState(s.snapshot.pet.state);

      const live = Boolean(s.script) && (s.playing || s.t > 0);
      setPerforming((prev) => (prev === live ? prev : live));

      const text = s.snapshot.narration?.text ?? null;
      if (text !== narrationRef.current) {
        narrationRef.current = text;
        setNarration(text);
      }

      // 画布坐标 → 屏幕水平位移（近似：节点 x 落在 0~1020 区间）
      const wrap = wrapRef.current;
      if (wrap) {
        const nx = Math.max(0, Math.min(1, s.snapshot.pet.at[0] / 1020));
        wrap.style.transform = `translateX(${-nx * 420}px)`;
      }
    });
  }, []);

  // 无演出时：聚焦知识节点 → 宠物指向并讲解
  useEffect(() => {
    const controller = controllerRef.current;
    if (!controller || !focus || getPlayerState().script) return;
    controller.setState("point");
    const timer = setTimeout(() => controller.setState("explain"), 1200);
    return () => clearTimeout(timer);
  }, [focus]);

  if (!pet || pet.form !== "pixel") return null;

  // 演出进行中：旁白交给底部字幕条（大字、居中），宠物旁边不再重复一遍小气泡
  const bubble = performing ? null : (narration ?? (focus ? "我来讲解这条链路 →" : null));

  return (
    <div
      ref={wrapRef}
      className="pet-layer"
      style={{
        position: "fixed",
        right: 20,
        bottom: 176,
        zIndex: 4,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 6,
        pointerEvents: "none",
        userSelect: "none",
        transition: "transform 180ms linear",
      }}
    >
      {bubble ? (
        <div
          style={{
            background: "#1e1e1e",
            color: "#fff",
            fontSize: 12,
            lineHeight: 1.5,
            padding: "5px 9px",
            borderRadius: 10,
            maxWidth: 240,
            textAlign: "center",
            whiteSpace: "pre-wrap",
          }}
        >
          {bubble}
        </div>
      ) : null}
      <canvas ref={canvasRef} />
      <span style={{ fontSize: 11, color: "#8a8a8a" }}>{pet.name}</span>
    </div>
  );
}
