<div align="right">

**English** | [中文](./README.zh-CN.md)

</div>

# LingRui CavaNote

> A note-taking app with a knowledge canvas that explains itself — co-create the canvas with AI, then watch it walk you through it, pause anytime, and click into any node to dig deeper.

LingRui CavaNote turns "explaining" into "performing": chat with AI to draw your knowledge onto a canvas that stays in sync with your notes. Hit play and the canvas performs the explanation along a timeline — pause, fast-forward, replay, or click any node to keep asking questions.

## ✨ Features

- **AI × human co-edited canvas** — add nodes, connect, move, delete with plain language. **Requires an LLM** (OpenAI-compatible): there is no local fallback — if the AI service is unreachable, the app says so instead of faking an answer
- **Docs and canvas in sync** — one knowledge model, two views, bidirectional
- **Self-explaining canvas** — the explanation plays along a timeline: pause / fast-forward / speed control / replay
- **Click to dig deeper** — every node's detail card ships with FAQs you can keep asking
- **Optional multi-user realtime collaboration** — edit the same canvas together
- **Optional desktop app** — Electron shell with an embedded server, one-command packaging

## 🚀 Quick Start

Prerequisites: [Bun ≥ 1.2](https://bun.sh) (optional: Docker, Node 18+).

```bash
# 1. Install dependencies
bun install

# 2. Start the web app (localhost:5173)
bun run dev
```

That's it — data persists to local IndexedDB. **AI features require an LLM** (see the section below); there is no local explainer fallback.

### Want multi-user collaboration + a real LLM?

```bash
# 1. Start local dependencies (Postgres 17 / Valkey 8 / MinIO)
docker compose up -d

# 2. Configure the collab server
cp apps/collab/.env.example apps/collab/.env

# 3. Mint a local dev JWT (the collab server requires a token) into apps/web/.env
node scripts/dev-token.mjs
#   apps/web/.env:
#     VITE_COLLAB_URL=ws://localhost:1234
#     VITE_COLLAB_TOKEN=<token from the step above>
#     VITE_CHAT_API=/api/chat

# 4. Start the collab server (it reads apps/collab/.env automatically)
bun run dev:collab
```

Verify: open two browser windows — edits on one should appear on the other immediately;
restart the server and the content is still there (Yjs snapshots live in Postgres,
table `yjs_documents`).

### Plug in a real LLM

Any **OpenAI-compatible** backend works (OpenAI / DeepSeek / Groq / Ollama / vLLM…):

```bash
# apps/collab/.env
OPENAI_API_KEY=sk-...
OPENAI_BASE_URL=https://api.openai.com/v1
LLM_MODEL=gpt-4o-mini
```

**opencode-go** (its gateway speaks both Anthropic and OpenAI-compatible APIs; we use the latter):

```bash
bash scripts/dev-collab-oc.sh                   # key is read from ~/.local/share/opencode/auth.json
bash scripts/dev-collab-oc.sh deepseek-v4-pro   # optionally pick a model
```

Leave it blank and `/api/chat` returns 503 — the app tells you the server has no LLM configured (there is no local fallback).

> If Docker Hub is unreachable, pull from a mirror and re-tag, e.g.
> `docker pull docker.m.daocloud.io/valkey/valkey:8-alpine && docker tag … valkey/valkey:8-alpine`

### Desktop app (optional)

```bash
bun run dev:desktop    # dev with hot reload
bun run dist:desktop   # build distributable package
```

## 📖 Usage

Type plain-language instructions in the chat panel, for example:

- "Draw a user, a gateway and a Redis. Connect the user to the gateway, and let the gateway read Redis."
- "Move MySQL below RabbitMQ and connect them."
- "Walk me through this diagram."

- Click any node on the canvas to open its detail card and follow up with FAQ questions
- Use the timeline at the bottom to control the explanation: pause / fast-forward / speed / replay
- Skip or edit anything mid-explanation and it adapts — no dead ends

## 🧩 Tech Stack

| Layer | Tech |
|---|---|
| Frontend | Vite · React 19 · BlockNote · Excalidraw |
| Collaboration | Yjs · Hocuspocus |
| Storage | Postgres · Valkey (Redis) · MinIO (S3) |
| Runtime | Bun · Electron (desktop) |

## 📁 Repo Layout

```
apps/web        Web app
apps/collab     Collaboration + LLM proxy server
apps/desktop    Electron desktop app
packages/       knowledge / canvas / anim / ai / mascot / ui libraries
```

## 🔒 License

**AGPL-3.0-or-later**, see [LICENSE](./LICENSE). Network deployments must also provide source code to users. Upstream components and their licenses are documented in [VENDOR.md](./VENDOR.md) and [NOTICE](./NOTICE).