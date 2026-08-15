# AGENTS.md

本文件给人类与 AI Agent（Cursor / Claude Code / DeepSeek Harness 等）共同的开发约束。
**修改本仓库前必须阅读并遵守。**

## 项目一句话

dsh-visual-plan 是 DeepSeek Harness 的插件：把 Plan Mode 生成的计划变成可编辑节点图，
用户修改后通过 Plan Diff 确认、版本化存储，再可靠回写给 DSH 执行。
本质是 Agent 的 **Human Control Layer（人类控制层）**。

## 开发约束（不可违反）

1. 不改变现有 DSH Plan Mode 行为。
2. 所有新增功能必须向后兼容已有 `.plan` 数据。
3. 不允许为了未来功能提前引入复杂架构。
4. 优先保证数据一致性，再优化 UI。
5. 每完成一个 Phase 必须提供：
   - 修改文件列表
   - 数据结构变化
   - 测试结果
   - 已知问题

## 核心风险（改动前先想清楚）

- **Plan 生命周期管理**：状态机 `draft → reviewing → approved → executing → completed / failed`，
  迁移必须显式、可校验、可追溯。
- **版本与执行绑定**：`approvedVersion` / `executionVersion`；执行绑定批准版本，
  新草稿不得静默替换正在执行的版本。
- **Agent 修改计划权限控制**：Agent 不得静默修改已批准计划；变更必须先提出、经用户批准。

## 代码结构速览

- `src/schema` — VisualPlan / Task / Edge / Comment / Version 类型与校验
  （依赖存在性、自依赖、循环依赖检测、版本边界校验）
- `src/engine` — Markdown ⇄ Plan 转换、Plan Diff、版本创建
- `src/adapter` — DeepSeekHarnessAdapter（`exit_plan_mode` → VisualPlan；
  VisualPlan → 修订计划回写消息，绑定批准版本）
- `src/host` — `.plan/` 持久化与回环 API
- `src/client` — 「可视化计划」标签页（React Flow 画布、任务编辑器、评论、Diff 弹窗、Apply）

## 数据与版本

- `.plan/plan.json`（最新 VisualPlan）+ `plan.md`（Agent 可读）+ `revisions/vN.json`（不可变快照）
- 每次 Apply 生成新版本：`version+1`，同时记为 `approvedVersion` / `executionVersion`
- 回写消息必须声明批准版本（Plan vN），并禁止 Agent 静默改计划

## 提交流程

- 提交类型前缀：`feat` / `fix` / `docs` / `chore` / `test` / `refactor`
- 每个提交只做一个逻辑变更；提交前运行：
  `npm run typecheck && npm run build && npm run verify`
- 版本记录见 `CHANGELOG.md`（Keep a Changelog）；规划见 `ROADMAP.md`
