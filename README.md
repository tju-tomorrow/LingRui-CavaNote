# LingRui Scribe

> AI 基建动画解释器 + 画布宠物 + 知识落盘工具

用 Codex 风格的对话区 + Excalidraw 风格的知识画布，让 AI 调用服务器 / Redis / 数据库 /
消息队列 / 网关等基建实体，由一只 VRM 动漫吉祥物在画布上跑动，把知识点"演"一遍，
而不是"写"一遍。可暂停、重播、快进、点击节点追问，最后落盘成文档 / 动画 / 可交互场景。

## License

**AGPL-3.0-or-later**，见 [LICENSE](./LICENSE)。网络服务部署也必须向用户提供源码。

## 架构一句话

> **`packages/knowledge` 拥有"知识是什么"；`canvas` / `anim` / `mascot` 只负责"知识怎么显示"。**

三个视图共享同一份 Knowledge Node，绝不维护两套数据模型。

```
                    Knowledge (Y.Doc / KnowledgeNode)
                              │
        ┌─────────────────────┼─────────────────────┐
        ↓                     ↓                     ↓
   文档视图              画布视图              动画视图
 (BlockNote)           (Excalidraw)      (PixiJS + VRM + 时间轴)
        └─────────────────────┴─────────────────────┘
                              ↓
                        Yjs / Hocuspocus
                              ↓
                 Postgres + Redis + S3/MinIO
```

详见 [docs/architecture.md](./docs/architecture.md)。

## 仓库结构

```
apps/
  web/         Codex 风格前端（Vite + React 19）
  collab/      Yjs 实时协同服务（Hocuspocus + Postgres + Redis）
packages/
  knowledge/   唯一真相：KnowledgeNode 模型 + Y.Doc schema
  canvas/      Excalidraw 封装 + PixiJS 实时覆盖层
  mascot/      VRM 加载、状态机、口型
  anim/        时间轴 / tween / 播放器（seek / pause / ff）
  ai/          assistant-ui + AI SDK + tool 定义
  ui/          shadcn/ui 设计系统
  vendor/      从上游 fork 的源码（见 VENDOR.md）
docs/
  architecture.md
  adr/         架构决策记录
```

## 开发

需要 [bun](https://bun.sh) ≥ 1.2。

```bash
bun install
bun run dev          # 前端 → http://localhost:5173
bun run typecheck
bun run test

# 多人实时（可选）
docker compose up -d                 # Postgres + Valkey + MinIO
cp apps/collab/.env.example apps/collab/.env
bun run dev:collab                   # → ws://localhost:1234
cp apps/web/.env.example apps/web/.env.local   # 填 VITE_COLLAB_URL
```

前端默认**不需要任何后端**：笔记与画布存在浏览器 IndexedDB 里，刷新不丢。
要多端实时，把 `apps/web/.env.example` 复制为 `.env.local` 并指向协同服务。

## 当前进度（P0 已完成）

| 能力 | 状态 |
|---|---|
| 文档视图（BlockNote，绑定 Y.Doc） | ✅ |
| 画布视图（Excalidraw，从 Knowledge 派生） | ✅ |
| 点击画布节点 → 追问该节点 | ✅ |
| 本地持久化（刷新不丢） | ✅ |
| 多人实时（HocuspocusProvider，可选） | ✅ 代码就绪，需启服务 |
| AI 助手（assistant-ui runtime + 确定性讲解器） | ✅ 无真实 LLM |
| 时间轴 / 吉祥物 / 导出 | ⬜ P2–P4 |

已知欠账与原因见 [ADR-0009](./docs/adr/0009-canvas-and-runtime-sync.md)。

## 缝合策略

本项目采用 **vendor fork**：把上游仓库钉在固定 commit 上，整目录拷进 `packages/vendor/<name>/`，
再按需删减。所有上游来源、commit、license 记录在 [VENDOR.md](./VENDOR.md)。

```bash
# 例：把 BlockNote 钉在某个 commit 拷进来
bun run vendor blocknote https://github.com/TypeCellOS/BlockNote.git <commit-sha> packages
```

**不要手动复制粘贴**——那样无法跟上游 diff、无法 rebase。详见
[ADR-0001](./docs/adr/0001-license-and-vendoring.md)。
