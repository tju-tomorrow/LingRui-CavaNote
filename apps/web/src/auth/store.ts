/**
 * 账户状态（登录 / 注册 / 登出）
 *
 * token 存 localStorage：**同一个 token 既连协同（WebSocket）也调 /api/chat**，
 * 因为服务端签发与校验用的是同一套 secret/issuer（见 apps/collab/src/auth.ts）。
 *
 * 不登录也能用（本地优先）：此时回落到 VITE_COLLAB_TOKEN / 桌面端 bridge.token，
 * 或者干脆不连远端，只走本地 IndexedDB + 本地讲解器。
 */
import { useSyncExternalStore } from "react";
import { CHAT_API } from "../chat/remote";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

interface AuthState {
  token: string | null;
  user: AuthUser | null;
}

const KEY = "lingrui-auth";

/** /api/chat → /api/auth（桌面端是 http://127.0.0.1:PORT/api/chat，同样成立） */
const AUTH_BASE = CHAT_API.replace(/\/chat\/?$/, "/auth");

function load(): AuthState {
  if (typeof localStorage === "undefined") return { token: null, user: null };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { token: null, user: null };
    const parsed = JSON.parse(raw) as AuthState;
    return parsed.token && parsed.user ? parsed : { token: null, user: null };
  } catch {
    return { token: null, user: null };
  }
}

let state: AuthState = load();
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

function set(next: AuthState): void {
  state = next;
  try {
    if (next.token && next.user) localStorage.setItem(KEY, JSON.stringify(next));
    else localStorage.removeItem(KEY);
  } catch {
    /* 隐私模式：忽略 */
  }
  emit();
}

/** 当前 token（供 collab / chat 取用；未登录为 null） */
export function authToken(): string | null {
  return state.token;
}

export function currentUser(): AuthUser | null {
  return state.user;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${AUTH_BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `请求失败（${res.status}）`);
  return data;
}

export async function login(email: string, password: string): Promise<AuthUser> {
  const data = await post<{ token: string; user: AuthUser }>("/login", { email, password });
  set({ token: data.token, user: data.user });
  return data.user;
}

export async function register(
  email: string,
  password: string,
  name?: string,
): Promise<AuthUser> {
  const data = await post<{ token: string; user: AuthUser }>("/register", {
    email,
    password,
    name,
  });
  set({ token: data.token, user: data.user });
  return data.user;
}

export function logout(): void {
  set({ token: null, user: null });
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useAuth(): AuthState {
  return useSyncExternalStore(subscribe, () => state, () => state);
}
