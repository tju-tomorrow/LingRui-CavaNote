# packages/vendor — 上游源码 fork

这里放从上游仓库**整目录拷贝**的源码，见根目录 [VENDOR.md](../../VENDOR.md)。

## 规矩

1. **不在这里直接改业务逻辑。** 改动放到 `packages/<name>/` 封装层，或 `patch/`。
2. 每个子目录必须有 `VENDOR.md`（由 `scripts/vendor.sh` 生成），记录 upstream / commit / license。
3. 上游 `LICENSE` 原文必须保留。
4. 升级 = 改 commit 重新 vendor，不要手改。

## 用法

```bash
# 整仓拷贝
bun run vendor blocknote https://github.com/TypeCellOS/BlockNote.git <sha>

# 只拷需要的一部分
bun run vendor excalidraw https://github.com/excalidraw/excalidraw.git <sha> \
  packages/excalidraw packages/element packages/common packages/math
```

## 当前 vendor

| 目录 | 上游 | 状态 |
|---|---|---|
| `blocknote/` | TypeCellOS/BlockNote | 待 vendor（ADR-0002） |
| `excalidraw/` | excalidraw/excalidraw | 待 vendor（ADR-0003） |
| `assistant-ui/` | assistant-ui/assistant-ui | 待 vendor |
| `xyflow/` | xyflow/xyflow | 待 vendor（P2 可选） |
