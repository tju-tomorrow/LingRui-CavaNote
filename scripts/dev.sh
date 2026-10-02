#!/usr/bin/env bash
#
# 一条命令起「web + collab(LLM 代理)」。
#
# 为什么需要：AI 是本应用的**硬依赖**（不降级到本地讲解器）。web dev 把 /api/chat
# 代理到 collab server（默认 :1234），不启它就会「连不上 AI 服务」。所以 `bun run dev`
# 直接把两者一起拉起来。
#
# collab 必须用 **Node** 跑：Hocuspocus 4 依赖 crossws 的 Node 适配器，在 Bun 下会抛错
# （见 ADR-0010）。它的 dev 脚本会先 `bun build` 再 `node`。
#
# 零配置 LLM：startServer 会从 ~/.config/lingrui/config.json 或
# ~/.local/share/opencode/auth.json 探测（见 apps/collab/src/llm-env.ts）。
set -euo pipefail
cd "$(dirname "$0")/.."

PORT="${PORT:-1234}"
pids=()
cleanup() {
  for pid in "${pids[@]:-}"; do kill "$pid" 2>/dev/null || true; done
}
trap cleanup EXIT INT TERM

echo "[dev] 启动 collab server（:${PORT}，LLM 代理）…"
bun run --filter @lingrui/collab dev &
pids+=($!)

# 等 collab 把 /api/chat 挂好（最多 ~15s）——就绪后它是 401/200 而不是拒绝连接
for _ in $(seq 1 30); do
  if curl -s -o /dev/null --max-time 1 "http://localhost:${PORT}/api/chat"; then
    echo "[dev] collab 就绪"
    break
  fi
  sleep 0.5
done

echo "[dev] 启动 web…"
bun run --filter @lingrui/web dev
