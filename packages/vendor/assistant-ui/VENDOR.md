# vendored: assistant-ui（待执行）

尚未拷贝。

| 字段 | 值 |
| --- | --- |
| upstream | https://github.com/assistant-ui/assistant-ui |
| ref | 待钉 |
| commit | 待钉 |
| license | MIT |
| 计划拷贝 | `packages/react` `packages/ui` `packages/styles` `packages/react-ai-sdk` `packages/store` `packages/assistant-stream` |
| 计划删除 | `packages/svelte` `packages/vue` `packages/react-native` `packages/cloud` `apps` `examples` `templates` |

> 注：若后续需要 AI 编排，`packages/react-langgraph` 也值得留。

执行：

```bash
bun run vendor assistant-ui https://github.com/assistant-ui/assistant-ui.git <sha> packages
```
