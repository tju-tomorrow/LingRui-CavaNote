# vendored: xyflow（P2 可选，待执行）

尚未拷贝。用于"架构图模式"（规整的 Gateway→Service→DB）。见 architecture.md §2。

| 字段 | 值 |
| --- | --- |
| upstream | https://github.com/xyflow/xyflow |
| ref | 待钉 |
| commit | 待钉 |
| license | MIT |
| 计划拷贝 | `packages/react` `packages/system` |
| 计划删除 | `packages/svelte` |

执行：

```bash
bun run vendor xyflow https://github.com/xyflow/xyflow.git <sha> packages/react packages/system
```
