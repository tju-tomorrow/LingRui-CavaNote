# VENDOR — 上游来源登记表

本项目把需要的上游源码**整目录 fork** 进 `packages/vendor/<name>/`，再针对性删减。

规则：

1. **每条登记必须记录：名称 / 上游 repo / commit SHA / 拷贝日期 / license / 拷贝了哪些路径 / 删了哪些路径。**
2. vendor 目录内**保留上游 LICENSE 原文**，不许删。
3. 不要手改 vendor 源码的 license header。
4. 升级 = 改 commit SHA 重新 vendor + 重新打补丁，不要在 vendor 目录里直接改（改动写进 `packages/<name>/` 封装层，或用 `patch/`）。
5. AGPL-3.0 项目可以吞 MIT / Apache-2.0 / MPL-2.0 / GPL-3.0，**不能吞 BUSL / 专有 license**。

## 登记表

| 名称 | 用途 | 上游 repo | commit | 拷贝日期 | License | 已拷贝 | 已删除 |
|---|---|---|---|---|---|---|---|
| blocknote | 块编辑器 | https://github.com/TypeCellOS/BlockNote | `f64d5446e39d` | 2026-10-01 | MPL-2.0 / XL=GPL-3.0 | 整仓 | `docs` `tests` `examples` `playground` `scripts` `CHANGELOG` `CLA.md` `AGENTS.md` `CLAUDE.md` `pnpm-lock.yaml` `packages/mantine` `packages/ariakit` `packages/dev-scripts` |
| excalidraw | 手绘画布 | https://github.com/excalidraw/excalidraw | `1919728724a1` | 2026-10-01 | MIT | `packages/{excalidraw,element,common,math,utils}` | 未拷贝 `excalidraw-app` `charts` `laser-pointer` `fractional-indexing` |
| assistant-ui | AI 对话 UI | https://github.com/assistant-ui/assistant-ui | _待钉_ | — | MIT | — | — |
| xyflow | 节点图 | https://github.com/xyflow/xyflow | _待钉_ | — | MIT | — | — |

### 裁减记录（BlockNote）

- 删 `docs`(37M) / `tests`(16M) / `examples`(4.8M) / `playground`。
- 删 `packages/mantine` `packages/ariakit`：另一种 UI 适配层，我们用 `shadcn`。
- 删 `packages/dev-scripts`：只用于生成文档/示例。
- **保留** `shared/`（8 个 xl 包依赖它）与 `shared/assets/fonts`（PDF/Typst 导出运行时需要）。
- 体积 107M → 47M。

### 已知整合障碍（vendor 不进构建路径的原因）

- BlockNote 所有包用 pnpm `catalog:` 引用 `vite-plus`，bun 无法解析。
- BlockNote 已迁到 `@y/*`（Yjs 14 RC）命名空间，与本项目 yjs 13 需要对齐。
- Excalidraw 的包之间用**已发布 npm 版本**互引（`0.18.0`），不是 workspace link，所以 vendor 的
  `element`/`common`/`math`/`utils` 不被直接使用，需 alias 才能生效。

详见 [ADR-0008](../../docs/adr/0008-vendor-not-in-build-path.md)。

## License 兼容器（相对 AGPL-3.0 项目）

| License | 能否 copy 进本项目 | 备注 |
|---|---|---|
| MIT | ✅ | 保留版权声明即可 |
| Apache-2.0 | ✅ | 保留 NOTICE |
| MPL-2.0 | ✅ | 被改的文件需开源（AGPL 已满足） |
| GPL-3.0 | ✅ | 可并入 AGPL-3.0 |
| LGPL | ✅ | 动态链接更宽松 |
| AGPL-3.0 | ✅ | 同 license |
| BUSL-1.1 | ❌ | 非开源，仅可作为独立服务使用 |
| tldraw license | ❌ | 生产需付费 key |
| Remotion license | ❌ | 非 OSI |
| Spine / Live2D Cubism Core | ❌ | 专有运行时 |
| 无 license / «All rights reserved» | ❌ | 默认保留所有权利 |
