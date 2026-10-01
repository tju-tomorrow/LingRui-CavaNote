/**
 * 外部「追问」入口 —— 让聊天面板之外的地方（节点详情卡的 FAQ）也能发起提问。
 *
 * assistant-ui 的 thread 只能在 RuntimeProvider 内部操作，
 * 所以 ChatPanel 在 Provider 里挂一个 AskBridge 注册回调，这里只做转发。
 */
type AskFn = (text: string) => void;

let ask: AskFn | null = null;

export function registerAsk(fn: AskFn | null): void {
  ask = fn;
}

/** 向聊天面板发一条消息。返回是否成功（面板没就绪时 false）。 */
export function askLingRui(text: string): boolean {
  if (!ask) return false;
  ask(text);
  return true;
}