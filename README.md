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
PRD/
  主界面.md     主界面 PRD（逐区盘点 + 共编闭环）
  主界面.png
```

## 开发

需要 [bun](https://bun.sh) ≥ 1.2。

```bash
bun install
bun run dev          # 前端 → http://localhost:5173
bun run typecheck
bun run test

# 多人实时 + 真实 LLM（可选）
docker compose up -d                 # Postgres + Valkey + MinIO
cp apps/collab/.env.example apps/collab/.env
bun run dev:collab                   # → ws://localhost:1234，同时提供 /api/chat
cp apps/web/.env.example apps/web/.env.local
```

> ⚠️ **协同服务用 Node 跑**（`bun run dev:collab` 已封装：bun 构建 → node 运行）。
> 原因：Hocuspocus 4 内部依赖 crossws 的 Node 适配器，在 Bun 下会直接抛错。
> 见 [ADR-0010](./docs/adr/0010-collab-on-node-and-llm-proxy.md)。
>
> Postgres / Redis 都是可选的：没有 DB 只告警不退出（文档不落库），
> Redis 需要多实例时才设 `COLLAB_REDIS=1`。

## 接真实 LLM

在 `apps/collab/.env` 里填：

```bash
OPENAI_API_KEY=sk-...
OPENAI_BASE_URL=https://api.openai.com/v1   # 可换 DeepSeek / Groq / Ollama / vLLM
LLM_MODEL=gpt-4o-mini
```

不填也能用：`/api/chat` 返回 503，前端会**静默降级**到本地 planner。
两条路径共用同一套画布工具（`packages/ai` 的 executor），
所以「AI 自己画节点」的能力不依赖模型是否存在。

试试在对话框里输入「添加一个 Kafka 消息队列」，看画布。

前端默认**不需要任何后端**：笔记与画布存在浏览器 IndexedDB 里，刷新不丢。
要多端实时，把 `apps/web/.env.example` 复制为 `.env.local` 并指向协同服务。

## 当前进度（P0 已完成）

| 能力 | 状态 |
|---|---|
| 文档视图（BlockNote，绑定 Y.Doc） | ✅ |
| 画布视图（Excalidraw，从 Knowledge 派生） | ✅ |
| 点击画布节点 ↔ 文档知识卡片双向定位 | ✅ |
| 本地持久化（刷新不丢） | ✅ |
| 节点拖动位置持久化（存在 Y.Doc layout） | ✅ |
| 多人实时（HocuspocusProvider，可选） | ✅ |
| AI 追问 + 落盘到笔记 | ✅ 无真实 LLM 也可用 |
| AI 自己画节点（画布工具层） | ✅ 有 LLM 走模型，无 LLM 走本地 planner |
| 真实 LLM（/api/chat 代理任意 OpenAI 兼容后端） | ✅ |
| 用户手绘内容保留（知识变更不重置） | 🟡 已保留，但仍按指纹整场景重建（待按 ADR-0011 改增量） |
| 时间轴 / 吉祥物 / 导出 | ⬜ P2–P4 |
| 主界面壳（图标导航 / 真实笔记树 / 主标题区） | ⬜ P1.5 |
| 共编基座（Annotation + provenance + 增量 patch + 节点详情卡） | ⬜ P1.6 |

已知欠账与原因见 [ADR-0009](./docs/adr/0009-canvas-and-runtime-sync.md)（画布同步部分已被
[ADR-0011](./docs/adr/0011-ai-cocanvas-incremental-editing.md) 取代）。

主界面逐区盘点与待确认交互见 [`PRD/主界面.md`](./PRD/主界面.md)。

## 缝合策略

本项目采用 **vendor fork**：把上游仓库钉在固定 commit 上，整目录拷进 `packages/vendor/<name>/`，
再按需删减。所有上游来源、commit、license 记录在 [VENDOR.md](./VENDOR.md)。

```bash
# 例：把 BlockNote 钉在某个 commit 拷进来
bun run vendor blocknote https://github.com/TypeCellOS/BlockNote.git <commit-sha> packages
```

**不要手动复制粘贴**——那样无法跟上游 diff、无法 rebase。详见
[ADR-0001](./docs/adr/0001-license-and-vendoring.md)。
