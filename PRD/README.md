# PRD 索引 · LingRui Scribe

> 主界面图：`PRD/主界面.png`

## 文档

| 文档 | 内容 | 阶段 |
|---|---|---|
| [主界面.md](./主界面.md) | 共编闭环 + 逐区盘点 + 交互规格 v1 + 验收 | 全阶段 |
| [知识模型.md](./知识模型.md) | `KnowledgeNode` 扩字段 + `Annotation` + Y.Doc schema + `CanvasSnapshot` | P1.6 |
| [演出层.md](./演出层.md) | 时间轴 / 分镜 / 吉祥物 / 笔记进度 / seek 四联动 | P2 |
| [宠物.md](./宠物.md) | Personal Pet（个人宠物 / 讲解老师）：模型 + 工具 + 教学视频 | P2.5–P4 |
| [导出与分发.md](./导出与分发.md) | 视频 / 文档导出、保存、分享、Orama 搜索 | P4 |
| [桌面端.md](./桌面端.md) | Electron vs Tauri 决策 + 打包架构 | 交付形态 |
| [欠账清单.md](./欠账清单.md) | 死代码 / 未接线 / 假 UI 审计快照（含文件证据） | 全阶段 |

## 关键决策

- **AI × 人 共编画布**：增量 patch + 截图/数据回灌，取代此前「整体重建」方案。
- **协同服务跑 Node + LLM 代理 NDJSON 协议**。
- **画布派生**：画布由共享知识模型派生/重建，AI 只做增量修改。

## 分期

| 阶段 | 目标 |
|---|---|
| P0 ✅ | 文档 ⟷ 画布共享一份 Knowledge |
| P1.5 | 主界面壳（导航 / 笔记树 / 主标题区 / 节点图标） |
| P1.6 | 共编基座（Annotation + provenance + 增量 patch + 节点详情卡） |
| P2 | 演出层（时间轴 + 分镜 + 进度 + 吉祥物占位） |
| P2.5 | Personal Pet（像素宠物 + 教学状态 + `pet.*` 动作） |
| P3 | AI 编排（真实 LLM + 工具 + Context Packer + 追问落盘） |
| P4 | 落盘/分发（视频 / 文档导出 + 分享 + 搜索） |

## 协作边界（多 session）

- **文档侧**（`PRD/`）：本 PRD 集由文档 session 维护。
- **代码侧**（`packages/ai`、`apps/collab`、`apps/web`、`packages/knowledge`）：
  由实现 session 推进。
- 实现 P1.6 前，请先读 `知识模型.md`，避免沿用「整体重建」方案。
