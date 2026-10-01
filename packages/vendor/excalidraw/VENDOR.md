# vendored: excalidraw（待执行）

尚未拷贝。见 [ADR-0003](../../../docs/adr/0003-canvas-excalidraw.md)。

| 字段 | 值 |
| --- | --- |
| upstream | https://github.com/excalidraw/excalidraw |
| ref | 待钉 |
| commit | 待钉 |
| license | MIT |
| 计划拷贝 | `packages/excalidraw` `packages/element` `packages/common` `packages/math` `packages/utils` |
| 计划删除 | `excalidraw-app`（官方站点）`packages/charts` `packages/laser-pointer` 多余 `locales` |

执行：

```bash
bun run vendor excalidraw https://github.com/excalidraw/excalidraw.git <sha> \
  packages/excalidraw packages/element packages/common packages/math packages/utils
```
