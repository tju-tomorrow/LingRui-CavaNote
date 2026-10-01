<div align="right">

[English](./README.md) | **中文**

</div>

# LingRui Scribe

> 一款自带"会自己讲解"的知识画布的笔记应用：AI 与你共编画布，讲解随时可暂停、回放、追问。

LingRui Scribe 把"讲一遍"变成"演一遍"：在对话区让 AI 帮你把知识点画成一张知识画布，画布与你的笔记实时联动；点击播放，画布会沿时间轴自己演给你看 —— 随时暂停、快进、回放，点任意节点还能继续追问。

## ✨ 特性

- **AI × 人 共编画布** — 用自然语言添加节点、连线、移动、删除；本地规则讲解器兜底，**无需任何 API Key 即可开箱即用**
- **文档 × 画布实时联动** — 一份知识，两种视图，双向同步
- **会自己讲解** — 讲解过程沿时间轴自动演出，可暂停 / 快进 / 倍速 / 重播
- **点击节点追问** — 节点详情卡内置 FAQ，随手继续深挖
- **可选的多人实时协同** — 多端同时编辑同一张画布
- **可选的桌面端** — Electron 壳，自带内嵌服务，一键打包分发给用户

## 🚀 快速开始

前置依赖：[Bun ≥ 1.2](https://bun.sh)（可选：Docker、Node 18+）。

```bash
# 1. 安装依赖
bun install

# 2. 启动前端（localhost:5173）
bun run dev
```

**零配置即可体验核心功能**：没有协同服务、没有 LLM 时，数据存本地 IndexedDB，由内置的本地讲解器负责讲解。

### 需要多人协同 + 真实 LLM 时

```bash
# 1. 启动依赖服务（Postgres 17 / Valkey 8 / MinIO）
docker compose up -d

# 2. 配置协同服务
cp apps/collab/.env.example apps/collab/.env

# 3. 铸一个本地开发 JWT（协同服务要求 token），写进 apps/web/.env
node scripts/dev-token.mjs
#   apps/web/.env:
#     VITE_COLLAB_URL=ws://localhost:1234
#     VITE_COLLAB_TOKEN=<上一步输出的 token>
#     VITE_CHAT_API=/api/chat

# 4. 启动协同服务（会自动读 apps/collab/.env）
bun run dev:collab
```

验证：开两个浏览器窗口，一边改画布另一边应立刻跟着动；改完重启服务端，内容仍在
（Yjs 快照存在 Postgres 的 `yjs_documents` 表）。

### 接真实 LLM

任意 **OpenAI 兼容**后端都可以（OpenAI / DeepSeek / Groq / Ollama / vLLM…）：

```bash
# 在 apps/collab/.env 里填写
OPENAI_API_KEY=sk-...
OPENAI_BASE_URL=https://api.openai.com/v1
LLM_MODEL=gpt-4o-mini
```

**opencode-go**（网关同时提供 Anthropic 与 OpenAI 兼容两种形态，我们用后者）：

```bash
bash scripts/dev-collab-oc.sh                   # key 从 ~/.local/share/opencode/auth.json 读，不另存
bash scripts/dev-collab-oc.sh deepseek-v4-pro   # 也可指定模型
```

不填时 `/api/chat` 返回 503，前端自动降级到本地讲解器，功能依然可用。

> 国内网络拉不到 Docker Hub 时，用镜像源拉完再打回原名，例如：
> `docker pull docker.m.daocloud.io/valkey/valkey:8-alpine && docker tag … valkey/valkey:8-alpine`

### 桌面端（可选）

```bash
bun run dev:desktop    # 开发调试
bun run dist:desktop   # 打包分发包
```

## 📖 使用指南

在对话区直接用自然语言描述，例如：

- 「画一个用户、一个网关、一个 Redis，用户连到网关，网关读 Redis」
- 「把 MySQL 移到 RabbitMQ 下面，再连起来」
- 「帮我讲讲这张图」

- 点击画布上的任意节点：查看详情卡、点 FAQ 继续追问
- 底部时间轴控制讲解播放：暂停 / 快进 / 倍速 / 重播
- 讲解中途跳过或修改任意内容，讲解会自动适配，不打断思路

## 🧩 技术栈

| 层 | 技术 |
|---|---|
| 前端 | Vite · React 19 · BlockNote · Excalidraw |
| 协同 | Yjs · Hocuspocus |
| 存储 | Postgres · Valkey(Redis) · MinIO(S3) |
| 运行时 | Bun · Electron（桌面端） |

## 📁 目录结构

```
apps/web        前端应用
apps/collab     协同 + LLM 代理服务
apps/desktop    Electron 桌面端
packages/       knowledge / canvas / anim / ai / mascot / ui 等库
```

## 🔒 License

**AGPL-3.0-or-later**，见 [LICENSE](./LICENSE)。网络服务部署也必须向用户提供源码。上游引入及许可见 [VENDOR.md](./VENDOR.md)、[NOTICE](./NOTICE)。