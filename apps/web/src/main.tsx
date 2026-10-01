import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./index.css";

// 注意：这里刻意不使用 <StrictMode>。
// StrictMode 会在开发环境模拟"卸载再挂载"，而 Excalidraw 是通过 ref 暴露的命令式实例，
// 双挂载会导致我们拿到已卸载的 API 实例，updateScene 打在一个不会渲染的 scene 上。
// 详见 docs/adr/0009-canvas-imperative-sync.md。
createRoot(document.getElementById("root")!).render(<App />);
