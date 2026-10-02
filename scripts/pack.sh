#!/usr/bin/env bash
#
# 打新包 —— 构建 Electron 桌面端并产出安装包
#
#   npm run pack                      # 当前平台，产出安装包（dmg/zip 或 nsis 或 AppImage/deb）
#   npm run pack -- --dir             # 只产未打包的 .app 目录（快，调试用）
#   npm run pack -- --mac --win       # 指定目标平台
#   npm run pack -- --version 0.1.0   # 顺便改版本号（写进各 package.json）
#   SKIP_TYPECHECK=1 npm run pack     # 跳过类型检查
#
# 产物目录：apps/desktop/release
set -euo pipefail
cd "$(dirname "$0")/.."

VERSION=""
ARGS=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --version)
      VERSION="${2:-}"
      shift 2
      ;;
    *)
      ARGS+=("$1")
      shift
      ;;
  esac
done

if [[ -n "$VERSION" ]]; then
  echo "[pack] 版本 → $VERSION"
  for pkg in package.json apps/desktop/package.json apps/web/package.json; do
    python3 - "$pkg" "$VERSION" <<'PY'
import json, sys
path, version = sys.argv[1], sys.argv[2]
with open(path, encoding="utf-8") as f:
    data = json.load(f)
data["version"] = version
with open(path, "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=2)
    f.write("\n")
PY
  done
fi

# 签名：本机有 "Developer ID Application" 证书就自动签，没有就跳过（避免无证书时打包失败）。
# 手动覆盖：CSC_IDENTITY_AUTO_DISCOVERY=1/0
if [[ -z "${CSC_IDENTITY_AUTO_DISCOVERY:-}" ]]; then
  if security find-identity -v -p codesigning 2>/dev/null | grep -q "Developer ID Application"; then
    export CSC_IDENTITY_AUTO_DISCOVERY=true
    echo "[pack] 检测到 Developer ID 证书 → 启用签名"
  else
    export CSC_IDENTITY_AUTO_DISCOVERY=false
    echo "[pack] 未检测到签名证书 → 跳过签名（产物未签名，首次打开需右键「打开」）"
  fi
fi

if [[ "${SKIP_TYPECHECK:-0}" != "1" ]]; then
  echo "[pack] 类型检查…"
  bunx tsc --noEmit
fi

echo "[pack] 构建桌面端（main / preload / renderer）…"
bun run --filter @lingrui/desktop build

echo "[pack] electron-builder 打包…"
if [[ ${#ARGS[@]} -gt 0 ]]; then
  ( cd apps/desktop && bunx electron-builder "${ARGS[@]}" )
else
  ( cd apps/desktop && bunx electron-builder )
fi

echo "[pack] 完成 → apps/desktop/release"
ls -1 apps/desktop/release 2>/dev/null | sed 's/^/        /' || true

# 未签名：首次打开需右键「打开」或跑一次 xattr -dr com.apple.quarantine
if [[ "${CSC_IDENTITY_AUTO_DISCOVERY:-false}" == "false" ]]; then
  echo "[pack] 产物未签名。首次打开若被拦："
  echo "        xattr -dr com.apple.quarantine \"/Applications/LingRui CavaNote.app\""
fi
