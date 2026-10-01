import { resolve } from "node:path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const root = import.meta.dirname;

/**
 * 桌面端构建
 *
 * 关键点：
 *   - main/preload 用 externalizeDepsPlugin：pg / ioredis / @hocuspocus 这些
 *     留在 node_modules 由 electron-builder 打包，不塞进 bundle。
 *   - @lingrui/* 是本仓的 TS 源码包，**必须打进来**（Node 不能直接跑 TS），
 *     所以用 alias 而不是 dependency。
 *   - renderer 直接复用 apps/web，不 fork（见 PRD/桌面端.md §2）。
 */
export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        "@lingrui/collab": resolve(root, "../collab/src/index.ts"),
        "@lingrui/ai": resolve(root, "../../packages/ai/src/index.ts"),
        "@lingrui/knowledge": resolve(root, "../../packages/knowledge/src/index.ts"),
        "@lingrui/anim": resolve(root, "../../packages/anim/src/index.ts"),
      },
    },
    build: {
      rollupOptions: {
        input: resolve(root, "src/main/index.ts"),
        // electron 在 devDependencies 里，externalizeDepsPlugin 不会外置它；
        // 一旦被打进 bundle，import "electron" 拿到的是 npm shim（会在加载时
        // 尝试下载二进制并抛错），而不是 Electron 注入的内置模块。
        external: ["electron"],
      },
    },
  },

  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: resolve(root, "src/preload/index.ts"),
        external: ["electron"],
        // sandbox: true 的 preload 必须是 CommonJS（ESM preload 只在 sandbox:false 下可用）
        output: { format: "cjs", entryFileNames: "[name].cjs" },
      },
    },
  },

  renderer: {
    root: resolve(root, "../web"),
    // file:// 加载要求相对路径
    base: "./",
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        "@lingrui/knowledge": resolve(root, "../../packages/knowledge/src/index.ts"),
        "@lingrui/anim": resolve(root, "../../packages/anim/src/index.ts"),
        "@lingrui/canvas": resolve(root, "../../packages/canvas/src/index.ts"),
        "@lingrui/mascot": resolve(root, "../../packages/mascot/src/index.ts"),
        "@lingrui/ai": resolve(root, "../../packages/ai/src/index.ts"),
        "@lingrui/ui": resolve(root, "../../packages/ui/src/index.ts"),
      },
    },
    build: {
      outDir: resolve(root, "out/renderer"),
      emptyOutDir: true,
      rollupOptions: { input: resolve(root, "../web/index.html") },
    },
  },
});
