/**
 * @lingrui/ui — 设计系统
 *
 * shadcn/ui 是"源码分发"模式：组件通过 `bunx shadcn@latest add <name>` 生成到
 * 本包的 src/components/ 下，再由各 app 引用。此包只提供基础设施。
 */
export type ClassValue = string | number | null | undefined | false | ClassValue[];

/** 极简 cn()（真正接入时换成 clsx + tailwind-merge） */
export function cn(...inputs: ClassValue[]): string {
  const out: string[] = [];
  const walk = (v: ClassValue): void => {
    if (!v && v !== 0) return;
    if (Array.isArray(v)) v.forEach(walk);
    else out.push(String(v));
  };
  inputs.forEach(walk);
  return out.join(" ");
}
