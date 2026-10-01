/**
 * 外部「追问」入口 —— 让聊天面板之外的地方（节点详情卡的 FAQ）也能发起提问。
 *
 * assistant-ui 的 thread 只能在 RuntimeProvider 内部操作，
 * 所以 ChatPanel 在 Provider 里挂一个 AskBridge 注册回调，这里只做转发。
 */
import { isReadOnlyShare } from "../shell/share";

type AskFn = (text: string) => void;

let ask: AskFn | null = null;

export function registerAsk(fn: AskFn | null): void {
  ask = fn;
}

/**
 * 向聊天面板发一条消息。返回是否成功（面板没就绪时 false）。
 *
 * ⚠️ 只读分享视图里**直接拒绝**：这是唯一的写入口（提问 → agent → 改 Y.Doc）。
 * 光把输入框藏掉不够 —— 详情卡的 FAQ 按钮同样会走到这里。
 */
export function askLingRui(text: string): boolean {
  if (isReadOnlyShare()) return false;
  if (!ask) return false;
  ask(text);
  return true;
}