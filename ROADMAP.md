# 路线图 / Roadmap

> 方向定位：dsh-visual-plan 不是「插件小功能」，而是 DeepSeek Harness 的
> **Human Control Layer（人类控制层）**——让用户看得见、改得动、批得准 Agent 的计划。
> 最大的技术风险不在 Canvas，而在 **Plan 生命周期管理、版本与执行绑定、Agent 修改计划权限控制**。

## v0.1 — Visual Plan MVP（已完成 ✓）

- [x] Visual Plan MVP
- [x] DSH Adapter（`exit_plan_mode` → VisualPlan；VisualPlan → 修订计划回写消息）
- [x] Canvas（DAG 自动布局、缩放、平移、选择、Minimap、Fit View）
- [x] Editing（新增 / 删除 / 编辑任务、依赖连线）
- [x] Comment（任务批注）
- [x] Diff（结构化 Plan Diff）
- [x] Version（v1 → vN，`revisions/vN.json` 不可变快照）
- [x] Apply → DSH（回写消息绑定批准版本，禁止静默改计划）
- [x] 首次发布（GitHub、fresh profile 验证、v0.1.0 tag）

## v0.1.1 — Editor Foundation + Execution Safety（开发中，P0 已实现）

目标：补齐编辑器基础与执行安全，**不引入新的大功能**。

### P0

- [x] **Undo / Redo**
  - `PlanEditorState` 增加 `past / future` 快照栈（深度上限 100）；所有 reducer 变更入栈。
  - 工具栏按钮 + Cmd/Ctrl+Z / Cmd/Ctrl+Shift+Z；`discard` / `applied` / `reset` 清空历史。
- [x] **Shortcut**（输入框聚焦时不生效）
  - Delete / Backspace 删除选中节点；Cmd/Ctrl+S 打开 Diff；Space 平移；F Fit View。
- [x] **Plan State Machine**
  - 显式状态机：`draft → reviewing → approved → executing → completed / failed`。
  - 定义允许的迁移与守卫（如 executing 不得直接回 draft；failed 只能由 executing 进入）。
  - schema 校验加入状态迁移规则；UI 状态徽标与状态机一致。
- [x] **Snapshot**
  - Apply 时写入 `.plan/execution.json`：`{ planId, executionVersion, revision, startedAt, status }`，
    绑定不可变 `revisions/vN.json`；后续草稿 / 新 Apply 不得修改。
- [x] **Execution Version Lock**
  - `executionVersion` 一旦写入即只读；执行中 Apply 只提升 `approvedVersion`，
    回写消息继续绑定执行中的版本。

### P1

- [ ] **Bug Fix**（真实任务验证反馈；候选：孤立节点提示、删除后选择状态清理、空状态语言切换）
- [x] **Validation**（状态机迁移校验、executionVersion 锁校验、向后兼容 `.plan` 数据校验）

### 验收标准（v0.1.1 Release）

- typecheck + build + verify（含新增用例）全绿（当前 93 项）
- GUI probe 通过（标签注册、视图挂载、0 控制台错误）
- 全新 profile 从 GitHub 安装 `v0.1.1` tag 验证通过
- CHANGELOG / ROADMAP 更新后 tag `v0.1.1`

## v0.2 — Plan Intelligence（规划中）

### P0

- [ ] **NL Plan Editing** ⭐：「把数据库迁移删除，API 和前端并行开发，测试放到最后」
  → 自动编辑 DAG，而不是手动拖线。
- [ ] **Plan Diff Generation**：v0.1 已有结构化 diff；v0.2 增强可读性
  （自然语言变更说明、按影响面分组）。

### P1

- [ ] **File Change Preview**：节点展开显示 `+ src/login.ts` / `~ src/auth.ts` / `- src/old-auth.ts`，
  从「任务可视化」升级为「变更意图可视化」。
- [ ] **AI Plan Review**：结构化 Plan Health
  （依赖 / 冗余 / 缺失 / 并行化 / 风险），不做「AI 复评」。

### P2

- [ ] **Comment Enhancement**（回复 / 状态 / @）
- [ ] **Focus Mode**（当前节点 + 上下游，其他淡化；v0.2.x 可提前，不阻塞主版本）

## v0.3 — Execution Intelligence（规划中）

- [ ] Execution Status（实时节点状态）
- [ ] Plan / Execution Unified Graph（同一节点既是 Plan 又是 Execution，不另做一套执行图）
- [ ] Parallel Task Execution（`Visual Graph → Execution Planner → Dependency Resolution → Runnable Tasks → Agent`）
- [ ] Sub-agent Tree
- [ ] Dynamic Replanning（基于版本边界，不失控）

## v0.4 — Agent Protocol（规划中）

- [ ] Generic Agent Protocol 先行：VisualPlan 作为不同 Agent 之间的统一计划交换格式
- [ ] Claude Adapter / Codex Adapter / Gemini Adapter（接入统一协议）

## v1.0 — Agent Workflow IDE

- [ ] Agent Workflow IDE / Multi-agent / Advanced Re-planning / Ecosystem

## 当前阶段：产品验证（先于一切新功能）

v0.1 作为产品验证版本，**不再堆功能**。先用 5～10 个真实复杂任务测试
（OAuth、数据库重构、新增 API、模块迁移、复杂 Bug 修复等），观察用户在哪一步卡住，
把卡点映射到路线图：

| 用户卡点 | 对应功能 |
| --- | --- |
| 看不懂 Plan | 节点信息不够 |
| 不知道 Agent 要改什么 | File Change Preview |
| 修改节点太麻烦 | Natural Language Editing |
| 不知道 Plan 有没有问题 | AI Plan Review |
| 执行后 Plan 失控 | Snapshot / Version Lock |
| 节点太多看不懂 | Focus Mode |

## 核心风险（技术重点）

1. **Plan 生命周期管理**：状态机必须显式、可校验、可追溯。
2. **版本与执行绑定**：`approvedVersion` / `executionVersion` 锁语义，执行永远绑定批准版本。
3. **Agent 修改计划权限控制**：Agent 不得静默修改已批准计划；变更必须先提出、经用户批准。

## 开发约束（所有 Phase 必须遵守）

1. 不改变现有 DSH Plan Mode 行为。
2. 所有新增功能必须向后兼容已有 `.plan` 数据。
3. 不允许为了未来功能提前引入复杂架构。
4. 优先保证数据一致性，再优化 UI。
5. 每完成一个 Phase 必须提供：
   - 修改文件列表
   - 数据结构变化
   - 测试结果
   - 已知问题

## 第一版明确不做

以下内容不进入 v0.1 / v0.1.1，避免为「以后可能需要」提前实现：

- 多 Agent / 多人实时协作
- Claude / Codex / Gemini 支持
- 云端同步
- MCP 工作流可视化
- 实时 Token / Reasoning 可视化
- 复杂评论系统 / Figma 风格协作
- 工作流市场 / 插件市场
- 快捷键（推迟到 v0.1.1）
