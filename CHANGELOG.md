# Changelog

本项目的所有重要变更都会记录在此文件中。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [Unreleased]

### Added

- `plan.approvedVersion` / `plan.executionVersion` 版本边界字段：执行绑定到用户批准的版本，
  后续草稿（如 v5）不得静默替换正在执行的 v4。
- 回写消息显式声明批准版本（Plan vN），并要求 Agent 执行中遇到变化时先提出新计划、由用户批准。
- 工具栏显示「已批准 vN」徽标，Plan ↔ Agent 状态边界可视化。
- schema 校验：无效的版本边界（非正整数、超过当前版本）会被修复为 null 并给出警告。
- 显式 Plan 生命周期状态机（`draft → reviewing → approved → executing → completed / failed`）：
  迁移表 + 状态/版本一致性校验（warning，向后兼容旧 `.plan` 数据）。
- **Execution Version Lock**：`executionVersion` 写一次只读；执行中 Apply 只提升
  `approvedVersion`，回写消息继续绑定执行中的版本。
- **Plan Snapshot**：Apply 时写入 `.plan/execution.json`
  （`{ planId, executionVersion, revision, startedAt, status }`），每个执行版本写一次。
- **Undo / Redo**：编辑器历史栈（上限 100），工具栏按钮 + 快捷键，评论增删可撤销。
- **快捷键**：Delete / Backspace 删除节点、Cmd/Ctrl+Z / Shift+Z 撤销重做、
  Cmd/Ctrl+S 打开 Diff、Space 平移、F Fit View（输入框聚焦时不生效）。
- 工具栏「适应视图（F）」按钮；执行中与已批准版本不同时显示「执行中 vN」徽标。
- 工具栏收敛：自动布局 / 适应视图 / 地图 / 交互 / 全屏与主题合并到「更多」下拉菜单，
  按「视图 / 外观」分组，主工具栏只保留高频操作。
- 白天主题对齐 DSH 真实浅色令牌（纯白画布 + 近黑文字），与跟随模式的浅色外观一致。

### Fixed

- 「交互」开关的选择不再在切换对话 / 可视化计划后丢失，偏好持久化到本地存储。
- 主题「跟随」模式在浅色 DSH Web 界面下不再错误显示为深色（改用 DSH 真实设计令牌）。
- GUI probe 改为按标签文本点击「可视化计划」，消除按钮索引在重渲染间的竞态导致的误报。

## [0.1.0] - 2026-08-15

初始版本（本地已完成，待首次发布）。

### Added

- 结构化 VisualPlan 数据模型：VisualPlan / Task / Edge / Comment / PlanVersion，含 schema 校验。
- 依赖校验：依赖不存在、自依赖、循环依赖检测。
- Markdown ⇄ VisualPlan 转换引擎。
- DeepSeek Harness 适配器：`exit_plan_mode` → VisualPlan，VisualPlan → 修订计划回写消息。
- React Flow 节点图画布：DAG 自动布局、拖拽、缩放、平移、选择、Minimap、Fit View。
- 任务编辑：新增 / 删除 / 编辑任务（标题、描述、类型、状态、依赖）。
- 批注系统：任务评论的添加与随版本保存。
- Plan Diff：新增 / 删除 / 修改 / 依赖变更汇总，确认后提交。
- 版本化持久化：`.plan/plan.json` + `plan.md` + `revisions/vN.json`，每次 Apply 生成不可变新版本。
- 修订计划回写：用户批准后向 Agent 发送修订消息并继续执行。
- 画布偏好：主题（跟随 / 白天 / 黑夜）、地图开关、全屏、交互开关，持久化到本地存储。
- 中英双语界面，跟随 DSH 自带 Language 设置（默认中文）。
- 左下角 React Flow 控件高对比度样式。

### Fixed

- Apply 后计划版本正确递增；Agent 新生成的计划会被采纳为新的编辑基准。

## 版本链接

[0.1.0]: https://github.com/JIAQI23333/dsh-visual-plan/releases/tag/v0.1.0
[Unreleased]: https://github.com/JIAQI23333/dsh-visual-plan/compare/v0.1.0...HEAD
