/**
 * 聊天用的小工具：从 assistant-ui 的消息里取纯文本、模拟流式切片
 */

interface PartLike {
  type: string;
  text?: string;
}

interface MessageLike {
  content: readonly PartLike[];
}

/** 把一条消息的所有 text part 拼成纯文本 */
export function textOf(message: MessageLike): string {
  return message.content
    .filter((p) => p.type === "text")
    .map((p) => p.text ?? "")
    .join("");
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 按 2~4 个字切块，模拟流式输出 */
export function* chunks(text: string): Generator<string> {
  let i = 0;
  while (i < text.length) {
    const size = Math.min(2 + Math.floor(Math.random() * 3), text.length - i);
    yield text.slice(i, i + size);
    i += size;
  }
}
