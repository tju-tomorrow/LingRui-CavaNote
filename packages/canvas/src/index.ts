/**
 * @lingrui/canvas — 画布层（ADR-0013：maxGraph 引擎）
 *
 * 职责边界：maxGraph 只是**渲染器**。cell 只存 `{ nodeId }` + 表现属性，正文永远在 Y.Doc。
 *
 *   shapes.ts          —— 语义形状词汇表（kind → 图形/配色/尺寸）
 *   mxgraph-binding.ts —— Knowledge → maxGraph 的纯函数绑定 + 同步计划
 *   graph-engine.ts    —— 命令式 maxGraph 适配层（DOM）
 */
export * from "./shapes";
export * from "./annotation-binding";
export * from "./stencil-library";
export * from "./mxgraph-binding";
export * from "./graph-engine";
