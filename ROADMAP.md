# 路线图 / Roadmap

## v0.1 — 可视化计划 MVP（已完成，待首次发布）

第一版目标：证明 **DSH 的计划能被结构化转换为可视化节点图，用户能修改这张图，并把修改后的计划可靠地交还给 DSH 执行**。

已完成：

- [x] VisualPlan / Task / Edge / Comment / Version 数据模型与 schema 校验
- [x] 依赖校验（不存在 / 自依赖 / 循环依赖检测）
- [x] Markdown ⇄ VisualPlan 转换引擎
- [x] DeepSeek Harness 适配器（`exit_plan_mode` → VisualPlan；VisualPlan → 修订计划回写消息）
- [x] React Flow 节点图画布（DAG 自动布局、拖拽、缩放、平移、选择、Minimap、Fit View）
- [x] 任务编辑：新增 / 删除 / 编辑（标题、描述、类型、状态、依赖）
- [x] 批注系统（任务评论）
- [x] Plan Diff（新增 / 删除 / 修改 / 依赖变更）
- [x] 版本化持久化 `.plan/`（plan.json + plan.md + revisions/vN.json）
- [x] 修订计划回写 DSH 并继续执行
- [x] 画布偏好：主题跟随 / 白天 / 黑夜、地图开关、全屏、交互开关（本地持久化）
- [x] 中英双语界面，跟随 DSH Language 设置（默认中文）
- [x] 验证：66 项离线契约 + 纯逻辑检查；GUI probe 与 plan-flow E2E 脚本

待首次发布：

- [ ] GitHub 仓库发布（`dsh-plugin` topic）
- [ ] 全新 profile 从零安装验证（GitHub 分发路径）
- [ ] 首次 release tag（v0.1.0）与 CHANGELOG 对齐

## v0.2 — 计划体验增强（规划中）

- 自然语言修改计划（NL Plan Editing）
- AI Plan Review（AI 自动审查 / 优化计划建议）
- 更好的评论系统（回复、状态、@）
- 文件变更预览（File Change Preview）

## v0.3 — 执行可视化（规划中）

- 执行状态可视化（实时节点状态：running / completed / failed）
- Sub-agent 图
- 并行任务
- 动态重新规划

## v0.4 — 多 Agent（规划中）

- Claude Adapter
- Codex Adapter
- Gemini Adapter
- 通用 Agent 协议（Generic Agent Protocol）

## 第一版明确不做

以下内容不进入 v0.1，避免为「以后可能需要」提前实现：

- 多 Agent / 多人实时协作
- Claude / Codex / Gemini 支持
- 云端同步
- MCP 工作流可视化
- 实时 Token / Reasoning 可视化
- 复杂评论系统 / Figma 风格协作
- 工作流市场 / 插件市场
- 快捷键
