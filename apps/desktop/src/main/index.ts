/**
 * 桌面端主进程
 *
 * 职责（见 PRD/桌面端.md §2、§3）：
 *   1. 启动内嵌服务（Hocuspocus + /api/chat 代理），只绑 127.0.0.1 + 随机端口 + 一次性 token
 *   2. 创建窗口，通过 preload 把 `{ chatApi, collabUrl, token }` 交给 renderer
 *   3. LLM Key 只存在于主进程环境变量，renderer 永不接触
 *
 * 为什么主进程能跑 Hocuspocus：Electron 主进程就是 Node，
 * 而 Hocuspocus 4 依赖 crossws 的 Node 适配器（Bun 下会抛错，见 ADR-0010）。
 *
 * 自检：`electron . --smoke`
 *   无 GUI 也能验证「内嵌服务起来了 + token 边界生效 + renderer 拿到桥并渲染出画布」。
 */
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { BrowserWindow, app, shell, type WebPreferences } from "electron";
import { startServer, type RunningServer } from "@lingrui/collab";

export interface DesktopBridge {
  isDesktop: true;
  /** 内嵌 /api/chat 的完整地址 */
  chatApi: string;
  /** 内嵌协同服务的 WebSocket 地址 */
  collabUrl: string;
  /** 一次性本地 token，renderer 调本地服务时要带上 */
  token: string;
  appVersion: string;
}

let server: RunningServer | null = null;
let bridge: DesktopBridge | null = null;
let mainWindow: BrowserWindow | null = null;

const isSmokeTest = process.argv.includes("--smoke");

async function bootEmbeddedServer(): Promise<DesktopBridge> {
  const token = randomBytes(24).toString("hex");

  server = await startServer({
    // 0 = 系统分配随机端口，避免和别的程序撞
    port: 0,
    host: "127.0.0.1",
    localToken: token,
    // 桌面端默认单机：没有 Postgres 也不影响（本地持久化走 renderer 的 IndexedDB）
    databaseUrl: process.env.DATABASE_URL,
    redisEnabled: process.env.COLLAB_REDIS === "1",
    quiet: isSmokeTest,
  });

  return {
    isDesktop: true,
    chatApi: `${server.httpUrl}/api/chat`,
    collabUrl: server.wsUrl,
    token,
    appVersion: app.getVersion(),
  };
}

function windowPreferences(): WebPreferences {
  return {
    preload: join(import.meta.dirname, "../preload/index.cjs"),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    webSecurity: true,
    // renderer 通过 process.argv 拿到 bridge（sandbox 下仍可用）
    additionalArguments: [`--lingrui-bridge=${JSON.stringify(bridge)}`],
  };
}

function rendererEntry(): { url?: string; file?: string } {
  const devUrl = process.env.ELECTRON_RENDERER_URL;
  if (devUrl) return { url: devUrl };
  return { file: join(import.meta.dirname, "../renderer/index.html") };
}

function createWindow(options: { show: boolean } = { show: true }): BrowserWindow {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: "#ffffff",
    title: "LingRui Scribe",
    show: options.show,
    webPreferences: windowPreferences(),
  });

  // 外链交给系统浏览器，不在应用内开新窗口
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  const entry = rendererEntry();
  if (entry.url) void win.loadURL(entry.url);
  else if (entry.file) void win.loadFile(entry.file);

  return win;
}

/** 自检：服务探测 + renderer 端到端 */
async function runSmokeTest(): Promise<void> {
  const assert = bridge!;
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  // 1) /api/chat：没配 LLM 应为 503（客户端据此降级到本地 planner）
  const withToken = await fetch(assert.chatApi, {
    method: "POST",
    headers: { "content-type": "application/json", "x-lingrui-token": assert.token },
    body: JSON.stringify({ messages: [{ role: "user", content: "ping" }] }),
  }).then((r) => r.status);

  // 2) 缺 token 应为 403（本地服务的安全边界）
  const withoutToken = await fetch(assert.chatApi, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ messages: [] }),
  }).then((r) => r.status);

  // 3) renderer：preload 桥注入 + 页面渲染
  const win = createWindow({ show: false });
  await win.webContents.loadFile(join(import.meta.dirname, "../renderer/index.html"));

  // React + Excalidraw + BlockNote 挂载需要一点时间
  let rendered = false;
  for (let i = 0; i < 40; i += 1) {
    rendered = await win.webContents
      .executeJavaScript("Boolean(document.querySelector('.excalidraw-host'))")
      .catch(() => false);
    if (rendered) break;
    await sleep(250);
  }

  const bridgeInRenderer = await win.webContents.executeJavaScript(
    "JSON.stringify(window.lingrui ?? null)",
  );
  const title = await win.webContents.executeJavaScript("document.title");

  console.log(
    `SMOKE ${JSON.stringify({
      port: server!.port,
      persistenceReady: server!.persistenceReady,
      chatWithToken: withToken,
      chatWithoutToken: withoutToken,
      rendererTitle: title,
      rendererRenderedCanvas: rendered,
      rendererBridge: JSON.parse(bridgeInRenderer) ? "ok" : "missing",
    })}`,
  );

  win.destroy();
  await server?.stop();
  app.exit(withToken === 503 && withoutToken === 403 && rendered ? 0 : 1);
}

// 单实例：第二次启动就聚焦已有窗口
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(async () => {
    bridge = await bootEmbeddedServer();

    if (isSmokeTest) {
      await runSmokeTest();
      return;
    }

    mainWindow = createWindow();
    mainWindow.on("closed", () => {
      mainWindow = null;
    });

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        mainWindow = createWindow();
      }
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });

  // 退出前把内嵌服务和数据库连接收干净
  app.on("before-quit", (event) => {
    if (!server) return;
    event.preventDefault();
    const pending = server;
    server = null;
    void pending.stop().finally(() => app.quit());
  });
}
