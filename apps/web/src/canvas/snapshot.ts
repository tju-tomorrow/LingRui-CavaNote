/**
 * 画布截图（ADR-0013）
 *
 * maxGraph 渲染为 **SVG**，不再是 Excalidraw 的 canvas，所以旧的 `exportToBlob` 不可用。
 * 这里把容器内的 `<svg>` 序列化 → data URL → Image → canvas → PNG data URL。
 *
 * 取舍：导出的是**当前视口**（含平移/缩放），不是 fit-to-content 的整幅。
 * 对 Context Packer 足够（AI 要的是「用户现在看到什么」）；整幅导出留待后续。
 */
import { getCanvas } from "./bridge";

function serialize(svg: SVGSVGElement, width: number, height: number): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(height));
  return new XMLSerializer().serializeToString(clone);
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("SVG 解码失败"));
    image.src = url;
  });
}

export interface PngOptions {
  scale?: number;
  /** 目标宽度（像素）；给了就按比例算高，忽略 scale */
  width?: number;
  background?: string;
}

export async function exportViewportPng(options: PngOptions = {}): Promise<string | undefined> {
  const engine = getCanvas();
  const svg = engine?.svg();
  if (!engine || !svg) return undefined;

  const { width, height } = engine.viewport();
  if (width < 1 || height < 1) return undefined;

  const scale = options.width ? options.width / width : (options.scale ?? 2);
  const xml = serialize(svg, width, height);
  const image = await loadImage(
    `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`,
  );

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return undefined;
  ctx.fillStyle = options.background ?? "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/png");
}
