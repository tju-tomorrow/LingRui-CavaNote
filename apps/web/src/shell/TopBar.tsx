/**
 * 顶栏（PRD/主界面.md §2.1）
 *
 * 组件全部来自 shadcn/ui：Button / Tooltip / DropdownMenu。
 * 图标来自 lucide-react。
 */
import { useState, type JSX, type ReactNode } from "react";
import {
  Download,
  LogIn,
  LogOut,
  Moon,
  PanelRightClose,
  PanelRightOpen,
  Play,
  Settings2,
  Share2,
  Sparkles,
  Square,
  Sun,
  Volume2,
  VolumeX,
} from "lucide-react";

import { logout, useAuth } from "../auth/store";
import { useDocumentActions } from "./actions";
import { useTheme } from "./theme";
import { setView } from "../state/view";
import { setTtsEnabled, ttsSupported, useTtsEnabled } from "../timeline/tts";
import { LoginDialog } from "./LoginDialog";
import { ShareDialog } from "./ShareDialog";
import { Button } from "../components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "../components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";

/** 图标按钮 + 悬停提示 */
function TipButton({
  label,
  onClick,
  children,
  pressed,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  pressed?: boolean;
}): JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant={pressed ? "secondary" : "ghost"}
          size="icon-sm"
          onClick={onClick}
          aria-label={label}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function TopBar({
  onOpenSearch,
  onOpenAi,
  onPresent,
  onToggleCanvas,
  present,
  canvasOpen,
}: {
  onOpenSearch: () => void;
  onOpenAi: () => void;
  onPresent: () => void;
  onToggleCanvas: () => void;
  present: boolean;
  canvasOpen: boolean;
}): JSX.Element {
  const [theme, setTheme] = useTheme();
  const [accountOpen, setAccountOpen] = useState(false);
  const { exportDoc, share, shareOpen, closeShare } = useDocumentActions();
  const auth = useAuth();
  const tts = useTtsEnabled();

  return (
    <header className="topbar tb">
      <span className="brand">LingRui</span>

      <button className="tb-search" type="button" onClick={onOpenSearch}>
        <span>搜索笔记、知识、标签…</span>
        <kbd>⌘K</kbd>
      </button>

      <div className="tb-spacer" />

      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="secondary" size="sm" className="rounded-full" onClick={onOpenAi}>
            <Sparkles />
            问 AI
          </Button>
        </TooltipTrigger>
        <TooltipContent>问 AI（⌘J）</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={canvasOpen ? "secondary" : "ghost"}
            size="sm"
            className="rounded-full"
            onClick={onToggleCanvas}
          >
            {canvasOpen ? <PanelRightClose /> : <PanelRightOpen />}
            画布
          </Button>
        </TooltipTrigger>
        <TooltipContent>{canvasOpen ? "收起画布（⌘\\）" : "展开画布（⌘\\）"}</TooltipContent>
      </Tooltip>

      <TipButton
        label={theme === "light" ? "切到暗色" : "切到亮色"}
        onClick={() => setTheme(theme === "light" ? "dark" : "light")}
      >
        {theme === "light" ? <Sun /> : <Moon />}
      </TipButton>

      {ttsSupported() ? (
        <TipButton
          label={tts ? "关闭旁白朗读" : "开启旁白朗读（TTS）"}
          pressed={tts}
          onClick={() => setTtsEnabled(!tts)}
        >
          {tts ? <Volume2 /> : <VolumeX />}
        </TipButton>
      ) : null}

      <TipButton label={present ? "退出演示" : "进入演示"} pressed={present} onClick={onPresent}>
        {present ? <Square /> : <Play />}
      </TipButton>

      <TipButton label="导出 Markdown" onClick={() => void exportDoc()}>
        <Download />
      </TipButton>

      <TipButton label="复制分享链接" onClick={() => void share()}>
        <Share2 />
      </TipButton>

      {/* 头像点开是**菜单**，不是直接退出 —— 单击就把人登出太危险 */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="default"
            size="icon-sm"
            className="rounded-full"
            aria-label={auth.user ? auth.user.name : "登录 / 注册"}
          >
            {auth.user ? auth.user.name.slice(0, 1) : <LogIn />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[13rem]">
          {auth.user ? (
            <>
              <DropdownMenuLabel>
                <div className="flex flex-col">
                  <span className="font-medium text-foreground">{auth.user.name}</span>
                  <span className="text-xs font-normal text-muted-foreground">
                    {auth.user.email}
                  </span>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setView("settings")}>
                <Settings2 />
                设置
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onSelect={() => logout()}>
                <LogOut />
                退出登录
              </DropdownMenuItem>
            </>
          ) : (
            <DropdownMenuItem onSelect={() => setAccountOpen(true)}>
              <LogIn />
              登录 / 注册
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {accountOpen ? <LoginDialog onClose={() => setAccountOpen(false)} /> : null}
      {shareOpen ? <ShareDialog onClose={closeShare} /> : null}
    </header>
  );
}
