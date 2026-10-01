/**
 * 界面图标（P1.5）—— 统一的内联 SVG 线性图标。
 *
 * 之前用 unicode 字形（▤ ◈ ▣ ◉ ⚙ ☀ ▷ ⤴ ↗）在不同字体/系统下粗细不一、显得廉价。
 * 这里统一成 24 视框 / 1.7 描边 / currentColor 的线性图标，跟随文字色与暗色。
 */
import type { JSX, ReactNode } from "react";

function Svg({ size = 18, children }: { size?: number; children: ReactNode }): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

type IconProps = { size?: number };

/** 笔记：文档 + 文本行 */
export const IconNotes = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <path d="M5 3.5h9L19 8.5v12H5z" />
    <path d="M13.8 3.6v5h5" />
    <path d="M8.6 13h6.8M8.6 16.4h6.8" />
  </Svg>
);

/** 知识库：节点网络 */
export const IconKnowledge = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <circle cx="12" cy="6" r="2.6" />
    <circle cx="5.6" cy="18" r="2.6" />
    <circle cx="18.4" cy="18" r="2.6" />
    <path d="M12 8.6 6.8 15.7M12 8.6l5.2 7.1M8.2 18h7.6" />
  </Svg>
);

/** 项目：文件夹 */
export const IconProjects = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <path d="M3.5 6.5a2 2 0 0 1 2-2h3.3l2 2.4h5.2a2 2 0 0 1 2 2v8.6a2 2 0 0 1-2 2H5.5a2 2 0 0 1-2-2z" />
  </Svg>
);

/** 标签：吊牌 */
export const IconTags = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <path d="M4 4.5h7.2l8.3 8.3a1.8 1.8 0 0 1 0 2.5l-4.7 4.7a1.8 1.8 0 0 1-2.5 0L4 11.7z" />
    <circle cx="8.2" cy="8.2" r="1.5" />
  </Svg>
);

/** 设置：滑杆 */
export const IconSettings = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <path d="M4 7h10M18 7h2M4 17h2M10 17h10" />
    <circle cx="16" cy="7" r="2.3" />
    <circle cx="8" cy="17" r="2.3" />
  </Svg>
);

export const IconSun = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 3v2.2M12 18.8V21M3 12h2.2M18.8 12H21M5.6 5.6l1.6 1.6M16.8 16.8l1.6 1.6M18.4 5.6l-1.6 1.6M7.2 16.8l-1.6 1.6" />
  </Svg>
);

export const IconMoon = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <path d="M20 14.4A8 8 0 0 1 9.6 4 8 8 0 1 0 20 14.4z" />
  </Svg>
);

export const IconPlay = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <path d="M8 5.4v13.2L19 12z" />
  </Svg>
);

export const IconStop = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <rect x="6.5" y="6.5" width="11" height="11" rx="2" />
  </Svg>
);

/** 导出：向下导出 */
export const IconExport = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <path d="M12 3.6v10.8M7.6 10l4.4 4.4L16.4 10" />
    <path d="M4.6 19.4h14.8" />
  </Svg>
);

/** 分享：节点连接 */
export const IconShare = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <path d="M9 13.4 15 10.2M9 13.4l6 3.2" />
    <circle cx="6.6" cy="13.4" r="2.5" />
    <circle cx="17.4" cy="8.6" r="2.5" />
    <circle cx="17.4" cy="17.4" r="2.5" />
  </Svg>
);
