/// <reference types="vite/client" />

/**
 * 桌面端（Electron preload）注入的桥。
 * web 版不存在，此时回退到 VITE_* 环境变量（见 PRD/桌面端.md §2「同一份前端，两个后端目标」）。
 */
interface LingRuiDesktopBridge {
  isDesktop: true;
  chatApi: string;
  collabUrl: string;
  token: string;
  appVersion: string;
}

interface Window {
  lingrui?: LingRuiDesktopBridge;
}
