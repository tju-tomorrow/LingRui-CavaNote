#!/usr/bin/env bash
#
# 用 ~/.zshrc 里 opencode-go 的 key 启动协同服务（/api/chat 走 deepseek）。
#
#   - key 复用 ~/.local/share/opencode/auth.json，**不另存**（与 zshrc 的 claude-oc / pi-oc 一致）
#   - 默认模型 deepseek-v4.1-flash，可传第一个参数覆盖：
#       bash scripts/dev-collab-oc.sh deepseek-v4-pro
#
# 前端:  bun run dev          （/api 已代理到 localhost:1234）
# 本脚本: 启动协同服务 + LLM 代理
set -euo pipefail

cd "$(dirname "$0")/.."

AUTH="$HOME/.local/share/opencode/auth.json"
if [[ ! -f "$AUTH" ]]; then
  echo "[dev-collab-oc] 找不到 $AUTH —— 先登录 opencode" >&2
  exit 1
fi

KEY="$(python3 -c 'import json,os;print(json.load(open(os.path.expanduser("~/.local/share/opencode/auth.json")))["opencode-go"]["key"])')"
if [[ -z "${KEY:-}" ]]; then
  echo "[dev-collab-oc] auth.json 里没有 opencode-go.key" >&2
  exit 1
fi

export OPENAI_BASE_URL="${OPENAI_BASE_URL:-https://opencode.ai/zen/go/v1}"
export OPENAI_API_KEY="$KEY"
export LLM_MODEL="${1:-${LLM_MODEL:-deepseek-v4.1-flash}}"
export LLM_SESSION="${LLM_SESSION:-lingrui-cavanote}"

echo "[dev-collab-oc] LLM = ${LLM_MODEL} @ ${OPENAI_BASE_URL} (session=${LLM_SESSION})"
exec bun run --filter @lingrui/collab dev
