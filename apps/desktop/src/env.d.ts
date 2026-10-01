/// <reference types="node" />

declare namespace NodeJS {
  interface ProcessEnv {
    /** electron-vite 在 dev 模式下注入的 renderer 地址 */
    ELECTRON_RENDERER_URL?: string;
    /** 桌面端可选：内嵌服务要连的 Postgres */
    DATABASE_URL?: string;
    /** 桌面端可选：设 1 时启用 Redis 多实例广播 */
    COLLAB_REDIS?: string;
    /** LLM（只存在于主进程） */
    OPENAI_API_KEY?: string;
    OPENAI_BASE_URL?: string;
    LLM_MODEL?: string;
  }
}

/** preload 暴露给 renderer 的桥 */
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
