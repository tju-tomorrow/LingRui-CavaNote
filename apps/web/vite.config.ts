import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // 协同服务（Yjs WebSocket）
      "/collab": { target: "ws://localhost:1234", ws: true },
      "/api": { target: "http://localhost:3001", changeOrigin: true },
    },
  },
});
