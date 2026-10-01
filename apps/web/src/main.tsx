import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./index.css";

// 说明：早期版本的画布用命令式 updateScene 做增量同步，与 StrictMode 的双挂载冲突
// （会拿到已卸载的 API 实例）。改成"派生 + captureUpdate 显式提交"后已能兼容，
// 因此这里恢复 StrictMode。详见 docs/adr/0009-canvas-and-runtime-sync.md。
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
