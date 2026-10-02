/**
 * 快捷键表（PRD/主界面.md §2.1 的 ⌘K 之外，补上「键盘优先」这一层）
 *
 * 一个天天用的工具，手不该离开键盘。这里只放**真的接了**的快捷键 ——
 * 列在帮助面板里却没实现，比没有更糟。
 */
export interface Shortcut {
  keys: string;
  label: string;
}

export const SHORTCUTS: Shortcut[] = [
  { keys: "Space", label: "播放 / 暂停演出" },
  { keys: "← / →", label: "上一个 / 下一个分镜" },
  { keys: "⌘K", label: "搜索（笔记 + 知识节点，跨全部笔记）" },
  { keys: "⌘F", label: "在本文中查找" },
  { keys: "⌘\\", label: "展开 / 收起画布面板" },
  { keys: "⌘S", label: "保存版本快照" },
  { keys: "⌘Z", label: "撤销（跨文档与画布）" },
  { keys: "⌘⇧Z", label: "重做" },
  { keys: "⌘/", label: "打开 / 关闭这个面板" },
  { keys: "1 – 5", label: "切换 笔记 / 知识库 / 项目 / 标签 / 设置" },
  { keys: "Esc", label: "关闭弹层 / 退出演示" },
  { keys: "双击节点", label: "改标题（画布上直接改）" },
  { keys: "拖动分隔条", label: "调整文档 / 画布宽度" },
  { keys: "滚轮 / 双指滑动", label: "平移画布（不再误触发缩放）" },
  { keys: "⌘ / Ctrl + 滚轮", label: "以鼠标为中心缩放（捏合手势也行）" },
  { keys: "✋ 工具 / 中键 / 右键拖动", label: "抓手平移画布" },
  { keys: "双击画布空白处", label: "复位视图（适应全部内容）" },
];

/** 正在输入时不要抢键 */
export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    el.isContentEditable === true
  );
}
