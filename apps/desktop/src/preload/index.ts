/**
 * preload —— 唯一允许接触主进程信息的边界
 *
 * 只暴露只读的 bridge 数据，不暴露任何 Node 能力（contextIsolation + sandbox 已开）。
 * bridge 由主进程通过 `additionalArguments` 注入，这里解析后挂到 window.lingrui。
 */
import { contextBridge } from "electron";

interface DesktopBridge {
  isDesktop: true;
  chatApi: string;
  collabUrl: string;
  token: string;
  appVersion: string;
}

const PREFIX = "--lingrui-bridge=";

function readBridge(): DesktopBridge | null {
  const arg = process.argv.find((a) => a.startsWith(PREFIX));
  if (!arg) return null;
  try {
    return JSON.parse(arg.slice(PREFIX.length)) as DesktopBridge;
  } catch {
    return null;
  }
}

const bridge = readBridge();

if (bridge) {
  contextBridge.exposeInMainWorld("lingrui", bridge);
}
