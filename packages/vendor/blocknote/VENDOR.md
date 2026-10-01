# vendored: blocknote（待执行）

尚未拷贝。见 [ADR-0002](../../../docs/adr/0002-editor-blocknote.md)。

| 字段 | 值 |
| --- | --- |
| upstream | https://github.com/TypeCellOS/BlockNote |
| ref | 待钉 |
| commit | 待钉 |
| license | MPL-2.0（`packages/xl-*` 为 GPL-3.0） |
| 计划拷贝 | `packages/core` `packages/react` `packages/shadcn` `packages/diagram-block` `packages/xl-ai` `packages/xl-*-exporter` |
| 计划删除 | `packages/mantine` `packages/ariakit` `packages/dev-scripts` `docs` `examples` `playground` |

执行：

```bash
bun run vendor blocknote https://github.com/TypeCellOS/BlockNote.git <sha> packages
```
