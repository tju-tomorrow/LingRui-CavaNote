import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      // 协同服务（Yjs WebSocket）与 HTTP API（/api/chat）
      "/collab": { target: "ws://localhost:1234", ws: true },
      "/api": { target: "http://localhost:1234", changeOrigin: true },
    },
  },
});
