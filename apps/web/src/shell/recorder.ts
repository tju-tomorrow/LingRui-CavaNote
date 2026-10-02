/**
 * 视频导出（PRD/导出与分发.md §1 / ADR-0013 引擎换成 maxGraph）
 *
 * 用浏览器原生 `MediaRecorder`，把 **maxGraph 画布（SVG）+ 宠物覆盖层** 合成到离屏
 * canvas，一边播放时间轴一边逐帧录制，产出 WebM。
 *
 * maxGraph 渲染为 SVG，不是 canvas，所以先把容器内的 `<svg>` 序列化 → Image，
 * 录制期间画布内容不变（只有覆盖层在动），序列化一次即可。
 *
 * 为什么不用 Revideo：那是 Node/无头 Chromium 的离线渲染，重依赖、要单独服务；
 * 这里先给一个**零依赖、即时可用**的通道。同一 `SceneScript` 仍是唯一输入，
 * 将来换 Revideo 不用改上游。
 *
 * 已知缺口：聚光灯（`.spotlight-layer`）是 DOM 覆盖层，未烘焙进视频。
 */
import { getPlayerState, player } from "../state/player";
import { getCanvas } from "../canvas/bridge";

/** 取页面上面积最大的匹配 canvas（宠物有多层 canvas） */
function largestCanvas(selector: string): HTMLCanvasElement | undefined {
  const list = [...document.querySelectorAll<HTMLCanvasElement>(selector)];
  return list.sort((a, b) => b.width * b.height - a.width * a.height)[0];
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("画布 SVG 解码失败"));
    image.src = url;
  });
}

/** 当前画布视口 → 位图（序列化一次，录制期间复用） */
async function snapshotCanvasImage(
  width: number,
  height: number,
): Promise<HTMLImageElement | undefined> {
  const engine = getCanvas();
  const svg = engine?.svg();
  if (!engine || !svg) return undefined;
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(height));
  const xml = new XMLSerializer().serializeToString(clone);
  return loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`);
}

function pickMime(): string {
  const candidates = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
  for (const c of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(c)) return c;
  }
  return "video/webm";
}

export async function recordAnimation(onProgress?: (t: number, total: number) => void): Promise<Blob> {
  const script = getPlayerState().script;
  if (!script) throw new Error("还没有演出，先和 AI 对话生成时间轴");
  if (typeof MediaRecorder === "undefined") throw new Error("当前环境不支持 MediaRecorder");

  const engine = getCanvas();
  if (!engine) throw new Error("找不到画布");

  const viewport = engine.viewport();
  const width = Math.max(1, Math.round(viewport.width)) || 1280;
  const height = Math.max(1, Math.round(viewport.height)) || 720;
  const base = await snapshotCanvasImage(width, height);
  const emphasis = largestCanvas(".emphasis-layer");
  const pet = largestCanvas(".pet-layer canvas");

  const out = document.createElement("canvas");
  out.width = width;
  out.height = height;
  const ctx = out.getContext("2d");
  if (!ctx) throw new Error("无法创建录制画布");

  const stream = out.captureStream(30);
  const mime = pickMime();
  const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6_000_000 });
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };
  const stopped = new Promise<Blob>((resolve) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: mime }));
  });

  player.seek(0);
  recorder.start(100);
  player.play();

  await new Promise<void>((resolve) => {
    const draw = () => {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
      if (base) ctx.drawImage(base, 0, 0, width, height);
      // 手绘强调层（与画布同尺寸，直接叠）
      if (emphasis && emphasis.width > 0) ctx.drawImage(emphasis, 0, 0, width, height);
      if (pet && pet.width > 0) {
        // 宠物是屏幕固定覆盖层，按画布宽度缩放后放到右下
        const scale = Math.min(1, width / 1600);
        const pw = pet.width * scale;
        const ph = pet.height * scale;
        ctx.drawImage(pet, width - pw - 24, height - ph - 140, pw, ph);
      }
      const s = getPlayerState();
      onProgress?.(s.t, s.duration);
      if (s.playing && s.t < s.duration - 0.02) requestAnimationFrame(draw);
      else resolve();
    };
    requestAnimationFrame(draw);
  });

  // 让最后一帧落进编码器
  await new Promise((r) => window.setTimeout(r, 150));
  recorder.stop();
  const blob = await stopped;
  stream.getTracks().forEach((t) => t.stop());
  return blob;
}

export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
