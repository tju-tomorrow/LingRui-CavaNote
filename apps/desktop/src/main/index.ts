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
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
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

/**
 * 让「双击启动」也能用 AI。
 *
 * 打包后的 App 从 Finder 启动拿不到 shell 的环境变量，于是这里在启动内嵌服务前
 * 按优先级把 LLM 配置读进 process.env：
 *   1. 已有 OPENAI_API_KEY（终端启动 / CI）—— 直接用
 *   2. ~/.config/lingrui/config.json        —— 用户自己的配置
 *   3. ~/.local/share/opencode/auth.json    —— 本机 opencode-go 网关（零配置）
 *
 * `chat.ts` 是「每次调用才读 env」，所以即使晚一点设也来得及。
 */
function loadLlmEnv(): void {
  if (process.env.OPENAI_API_KEY) return;

  const readJson = (path: string): Record<string, unknown> | null => {
    try {
      return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    } catch {
      return null;
    }
  };

  // 2) 用户配置
  const cfg = readJson(join(homedir(), ".config", "lingrui", "config.json"));
  if (cfg && typeof cfg["apiKey"] === "string" && cfg["apiKey"]) {
    process.env.OPENAI_API_KEY = cfg["apiKey"];
    if (typeof cfg["baseUrl"] === "string") process.env.OPENAI_BASE_URL = cfg["baseUrl"];
    if (typeof cfg["model"] === "string") process.env.LLM_MODEL = cfg["model"];
    if (typeof cfg["session"] === "string") process.env.LLM_SESSION = cfg["session"];
    console.log("[desktop] LLM 配置：~/.config/lingrui/config.json");
    return;
  }

  // 3) 本机 opencode-go（零配置可用）
  const auth = readJson(join(homedir(), ".local", "share", "opencode", "auth.json"));
  const go = auth?.["opencode-go"] as { key?: string } | undefined;
  if (go?.key) {
    process.env.OPENAI_API_KEY = go.key;
    process.env.OPENAI_BASE_URL ??= "https://opencode.ai/zen/go/v1";
    process.env.LLM_MODEL ??= "deepseek-v4.1-flash";
    process.env.LLM_SESSION ??= "lingrui-scribe";
    console.log("[desktop] LLM 配置：opencode auth.json（opencode-go）");
  }
}

/**
 * System One（TypeSafe / Jev）决策模型的 key。
 *
 * 优先级：
 *   1. 已有 TYPESAFE_API_KEY（终端 / CI）
 *   2. ~/.config/lingrui/config.json 的 systemOne
 *   3. ~/.cc-agents/settings.json 的 systemOne —— 复用本机已有的 Jev 配置，零配置可用
 *
 * 和 LLM 一样，`/api/systemone` 每次调用才读 env，晚设也来得及。
 * 读不到就什么都不做 —— 检索不做重排（fail-open），功能不受影响。
 */
function loadSystemOneEnv(): void {
  if (process.env.TYPESAFE_API_KEY) return;

  const readJson = (path: string): Record<string, unknown> | null => {
    try {
      return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    } catch {
      return null;
    }
  };

  const apply = (slot: unknown, source: string): boolean => {
    const s = slot as { apiKey?: string; endpoint?: string; model?: string } | undefined;
    if (!s?.apiKey) return false;
    process.env.TYPESAFE_API_KEY = s.apiKey;
    if (s.endpoint) process.env.TYPESAFE_ENDPOINT = s.endpoint;
    if (s.model) process.env.TYPESAFE_MODEL = s.model;
    console.log(`[desktop] System One（Jev）配置：${source}`);
    return true;
  };

  const cfg = readJson(join(homedir(), ".config", "lingrui", "config.json"));
  if (apply(cfg?.["systemOne"], "~/.config/lingrui/config.json")) return;

  const ccAgents = readJson(join(homedir(), ".cc-agents", "settings.json"));
  apply(ccAgents?.["systemOne"], "~/.cc-agents/settings.json");
}

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
  // macOS 玻璃（参考 cc-agents_desktop 的 Tauri hud 材质，这里是 Electron 等价物）：
  //   - vibrancy: "under-window" → NSVisualEffectView，跟随系统深/浅外观
  //   - titleBarStyle: "hiddenInset" → 隐藏原生标题栏，红绿灯浮在内容区左上
  //   - backgroundColor 透明 → 防首帧白闪，且不盖住 vibrancy 材质
  const isDarwin = process.platform === "darwin";
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: isDarwin ? "#00000000" : "#ffffff",
    title: "LingRui CavaNote",
    show: options.show,
    ...(isDarwin
      ? {
          titleBarStyle: "hiddenInset" as const,
          trafficLightPosition: { x: 16, y: 20 },
          vibrancy: "under-window" as const,
        }
      : {}),
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

  // 自检不真的打 LLM（避免网络/额度/不确定性）：临时清掉 key，走「未配置 → 503」分支
  const savedKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "";

  // 1) /api/chat：没配 LLM 应为 503（客户端不降级，会直接提示配置缺失）
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

  // React + maxGraph + BlockNote 挂载需要一点时间
  let rendered = false;
  for (let i = 0; i < 40; i += 1) {
    rendered = await win.webContents
      .executeJavaScript("Boolean(document.querySelector('.mxgraph-host svg'))")
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
  process.env.OPENAI_API_KEY = savedKey;
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
    loadLlmEnv();
    loadSystemOneEnv();
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
