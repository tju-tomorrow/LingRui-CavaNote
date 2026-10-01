/**
 * 旁白朗读（TTS）
 *
 * 用浏览器原生 Web Speech API：零依赖、零成本、不需要服务端。
 * 「讲解」这件事，能听和只能看完全是两个产品。
 *
 * 默认**关**：突然出声比没有声音更糟。用户在顶栏 🔊 或设置里打开，
 * 选择记在 localStorage。
 */
import { useSyncExternalStore } from "react";

const KEY = "lingrui-tts";

function load(): boolean {
  try {
    return localStorage.getItem(KEY) === "on";
  } catch {
    return false;
  }
}

let enabled = load();
const listeners = new Set<() => void>();

export function ttsSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function ttsEnabled(): boolean {
  return enabled;
}

export function setTtsEnabled(next: boolean): void {
  if (next === enabled) return;
  enabled = next;
  try {
    localStorage.setItem(KEY, next ? "on" : "off");
  } catch {
    /* ignore */
  }
  if (!next) stopSpeaking();
  for (const l of listeners) l();
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useTtsEnabled(): boolean {
  return useSyncExternalStore(subscribe, ttsEnabled, () => false);
}

/** 说一句（会打断上一句，避免叠在一起） */
export function speak(text: string): void {
  if (!enabled || !ttsSupported() || !text.trim()) return;
  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "zh-CN";
    utterance.rate = 1.05;
    utterance.pitch = 1;
    window.speechSynthesis.speak(utterance);
  } catch {
    /* 某些浏览器会抛（比如没有可用语音包）：静默即可 */
  }
}

export function stopSpeaking(): void {
  if (!ttsSupported()) return;
  try {
    window.speechSynthesis.cancel();
  } catch {
    /* ignore */
  }
}
