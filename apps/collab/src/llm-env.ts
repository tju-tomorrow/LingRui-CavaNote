/**
 * 零配置 LLM 探测（桌面端 / collab CLI / web dev 共用）
 *
 * `chat.ts` 每次调用才读 env，所以这里只要在**服务启动时**把 `process.env` 填好即可。
 * 优先级：
 *   1. 已有 OPENAI_API_KEY（终端 / CI）—— 不动
 *   2. ~/.config/lingrui/config.json          —— 用户自己的配置
 *   3. ~/.local/share/opencode/auth.json      —— 本机 opencode-go，零配置即可用
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

function readJson(path: string): Record<string, unknown> | null {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** 探测并写入 process.env；返回命中的来源（便于日志），没命中返回 null */
export function loadLlmEnv(): string | null {
  if (process.env.OPENAI_API_KEY) return "env";

  const cfg = readJson(join(homedir(), ".config", "lingrui", "config.json"));
  if (cfg && typeof cfg["apiKey"] === "string" && cfg["apiKey"]) {
    process.env.OPENAI_API_KEY = cfg["apiKey"];
    if (typeof cfg["baseUrl"] === "string") process.env.OPENAI_BASE_URL = cfg["baseUrl"];
    if (typeof cfg["model"] === "string") process.env.LLM_MODEL = cfg["model"];
    if (typeof cfg["session"] === "string") process.env.LLM_SESSION = cfg["session"];
    return "~/.config/lingrui/config.json";
  }

  const auth = readJson(join(homedir(), ".local", "share", "opencode", "auth.json"));
  const go = auth?.["opencode-go"] as { key?: string } | undefined;
  if (go?.key) {
    process.env.OPENAI_API_KEY = go.key;
    process.env.OPENAI_BASE_URL ??= "https://opencode.ai/zen/go/v1";
    process.env.LLM_MODEL ??= "deepseek-v4.1-flash";
    process.env.LLM_SESSION ??= "lingrui-scribe";
    return "opencode auth.json（opencode-go）";
  }

  return null;
}
