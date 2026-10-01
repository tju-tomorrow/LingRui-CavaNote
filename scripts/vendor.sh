#!/usr/bin/env bash
#
# vendor.sh — 把上游仓库钉在固定 commit 上，整目录拷进 packages/vendor/<name>/
#
# 与"手动复制粘贴"的区别：拷贝来源有 commit 记录，可 diff、可升级、可审计。
#
set -euo pipefail

usage() {
  cat <<'EOF'
用法:
  scripts/vendor.sh <name> <repo-url> <commit> [path...]

  name      packages/vendor/<name> 的目录名
  repo-url  上游 git 地址
  commit    tag / branch / SHA（建议用 SHA，可复现）
  path...   只拷贝这些子路径（省略 = 整个仓库，不含 .git）

示例:
  scripts/vendor.sh blocknote https://github.com/TypeCellOS/BlockNote.git <sha> packages
  scripts/vendor.sh excalidraw https://github.com/excalidraw/excalidraw.git <sha> packages/excalidraw packages/element packages/common
EOF
}

if [ $# -lt 3 ]; then usage; exit 1; fi

NAME="$1"
REPO="$2"
REF="$3"
shift 3
PATHS=("$@")

DEST="packages/vendor/$NAME"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "==> clone $REPO @ $REF"
git clone --quiet --filter=blob:none --no-checkout --single-branch --no-tags "$REPO" "$TMP/repo"
git -C "$TMP/repo" checkout --quiet "$REF"
SHA="$(git -C "$TMP/repo" rev-parse HEAD)"
DATE="$(date +%F)"

LICENSE_FILE=""
for f in LICENSE LICENSE.md LICENSE.txt COPYING COPYING.txt LICENSE-MPL.txt; do
  if [ -f "$TMP/repo/$f" ]; then LICENSE_FILE="$f"; break; fi
done

mkdir -p "$DEST"

# 上游 LICENSE 必须随源码一起拷（规则见根 VENDOR.md）
if [ -n "$LICENSE_FILE" ]; then
  cp "$TMP/repo/$LICENSE_FILE" "$DEST/$LICENSE_FILE"
fi

if [ ${#PATHS[@]} -eq 0 ]; then
  echo "==> copy whole tree -> $DEST"
  ( cd "$TMP/repo" && tar --exclude .git -cf - . ) | ( cd "$DEST" && tar -xf - )
else
  for p in "${PATHS[@]}"; do
    echo "==> copy $p"
    mkdir -p "$DEST/$(dirname "$p")"
    ( cd "$TMP/repo" && tar --exclude .git -cf - "$p" ) | ( cd "$DEST" && tar -xf - )
  done
fi

cat > "$DEST/VENDOR.md" <<EOF
# vendored: $NAME

| 字段 | 值 |
| --- | --- |
| upstream | $REPO |
| ref | $REF |
| commit | \`$SHA\` |
| copied | $DATE |
| license file | ${LICENSE_FILE:-未找到，需手工确认} |
| paths | ${PATHS[*]:-（整个仓库）} |

> 本目录为上游源码副本。**不要在此直接改业务逻辑**，改动放到 \`packages/$NAME\` 封装层或 \`patch/\`。
> 升级方式：重新运行 \`scripts/vendor.sh\`，并更新根 \`VENDOR.md\` 登记表。
>
> 注意：本目录**不在本仓 bun workspace 内**（见 ADR-0008），属于参考/定制源码，不参与主构建。
EOF

echo
echo "==> 完成。请把这行补进根 VENDOR.md 登记表："
LIC="$( [ -n "$LICENSE_FILE" ] && echo "见 $LICENSE_FILE" || echo "待确认" )"
echo "| $NAME | ... | $REPO | $SHA | $DATE | $LIC | ${PATHS[*]:-all} | — |"
