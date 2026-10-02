/**
 * 自定义设备形状（ADR-0013「真实表现力」）
 *
 * maxGraph 内置了圆柱（数据库）、人物、云、六边形，但**没有「一台机器」**。
 * 这里用 ShapeRegistry 注册一个服务器/机架形状：矩形机身 + 插槽分隔 + 状态灯灯。
 *
 * 这是 draw.io stencil 机制的轻量版：后续要接 AWS/Azure/网络设备的现成 stencil，
 * 走 `StencilShapeRegistry.add(name, new StencilShape(xml))`（见 ADR-0013）。
 */
import { RectangleShape, ShapeRegistry, type AbstractCanvas2D } from "@maxgraph/core";

/** 服务器机架：3 个插槽 + 每槽一个状态灯 */
class ServerShape extends RectangleShape {
  paintForeground(c: AbstractCanvas2D, x: number, y: number, w: number, h: number): void {
    if (w < 24 || h < 24) return;
    c.save();

    const slot = h / 3;

    // 插槽分隔线
    c.setStrokeColor(this.stroke);
    c.setStrokeWidth(1);
    c.setDashed(false);
    c.setAlpha(0.35);
    c.begin();
    c.moveTo(x, y + slot);
    c.lineTo(x + w, y + slot);
    c.moveTo(x, y + slot * 2);
    c.lineTo(x + w, y + slot * 2);
    c.stroke();

    // 每槽一颗状态灯（左侧）
    const d = Math.max(3, Math.min(5, h / 12));
    c.setAlpha(1);
    c.setFillColor("#22c55e");
    c.setStrokeColor(null);
    for (let i = 0; i < 3; i += 1) {
      c.ellipse(x + 8, y + slot * i + slot / 2 - d / 2, d, d);
      c.fill();
    }

    c.restore();
  }
}

let registered = false;

/** 幂等注册（Graph 构造时调用） */
export function registerDeviceShapes(): void {
  if (registered) return;
  ShapeRegistry.add("server", ServerShape);
  registered = true;
}
