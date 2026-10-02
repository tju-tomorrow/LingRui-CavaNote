/**
 * 界面图标 —— 统一走 **lucide-react**（公开图标库），不再手写 SVG。
 *
 * 对外仍导出原来那批 `IconXxx` 名字 + `{ size }` 入参，
 * 这样调用方（IconRail / TopBar / NoteTree）不用改。
 */
import type { ComponentType, JSX } from "react";
import {
  ChevronRight,
  ChevronDown,
  Download,
  Ellipsis,
  File,
  FileText,
  Folder,
  FolderKanban,
  Moon,
  Network,
  NotebookText,
  PanelRight,
  PanelRightClose,
  Play,
  Settings2,
  Share2,
  Sparkles,
  Search,
  Square,
  Sun,
  Tags,
  Trash2,
} from "lucide-react";

type IconProps = { size?: number };
type LucideComponent = ComponentType<{ size?: number | string; className?: string }>;

/** 把 lucide 组件包成 `({size}) => JSX` 的形态 */
const icon =
  (Comp: LucideComponent) =>
  ({ size = 18 }: IconProps): JSX.Element => <Comp size={size} />;

/* ---------- 导航 ---------- */
export const IconNotes = icon(NotebookText);
export const IconKnowledge = icon(Network);
export const IconProjects = icon(FolderKanban);
export const IconTags = icon(Tags);
export const IconSettings = icon(Settings2);

/* ---------- 笔记树 ---------- */
export const IconNote = icon(FileText);
export const IconFolder = icon(Folder);
export const IconChevron = icon(ChevronRight);
export const IconMore = icon(Ellipsis);

/* ---------- 顶栏 / 文档动作 ---------- */
export const IconSparkle = icon(Sparkles);
export const IconSun = icon(Sun);
export const IconMoon = icon(Moon);
export const IconPlay = icon(Play);
export const IconStop = icon(Square);
export const IconExport = icon(Download);
export const IconShare = icon(Share2);

/* ---------- 画布面板（可折叠） ---------- */
export const IconPanel = icon(PanelRight);
export const IconPanelCollapse = icon(PanelRightClose);

/* ---------- 回收站 / 查找 ---------- */
export const IconTrash = icon(Trash2);
export const IconSearch = icon(Search);
export const IconChevronDown = icon(ChevronDown);

/* ---------- 备用（新代码可直接用 lucide 原名） ---------- */
export { File, FileText, Folder, Ellipsis, Sparkles };
