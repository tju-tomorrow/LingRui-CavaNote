import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { TooltipProvider } from "./components/ui/tooltip";
import "./index.css";
import "./shell/polish.css";

// macOS 玻璃：只有桌面端（preload 桥注入）才启用；web 版浏览器没有 vibrancy 材质，保持不透明。
// 对应样式见 index.css 里的 html[data-glass="desktop"] 段。
if (window.lingrui?.isDesktop) {
  document.documentElement.dataset.glass = "desktop";
}

// 说明：早期版本的画布用命令式 updateScene 做增量同步，与 StrictMode 的双挂载冲突
// （会拿到已卸载的 API 实例）。改成"派生 + captureUpdate 显式提交"后已能兼容，
// 因此这里恢复 StrictMode。详见 docs/adr/0009-canvas-and-runtime-sync.md。
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {/* Radix 的 Tooltip.Root 要求祖先里有 Provider；挂一次在根上（TopBar 等都用它） */}
    <TooltipProvider>
      <App />
    </TooltipProvider>
  </StrictMode>,
);
