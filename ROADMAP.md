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
- [x] Plan ↔ Agent 状态边界：`plan.status / version / approvedVersion / executionVersion`，执行绑定批准版本
- [x] 画布偏好：主题跟随 / 白天 / 黑夜、地图开关、全屏、交互开关（本地持久化）
- [x] 中英双语界面，跟随 DSH Language 设置（默认中文）
- [x] 验证：77 项离线契约 + 纯逻辑检查；GUI probe 与 plan-flow E2E 脚本

待首次发布（Release）：

- [x] GitHub 仓库发布（`dsh-plugin` topic）
- [x] 全新 profile 从零安装验证（GitHub 分发路径）：
  真实执行 `dsh plugin --profile <scratch> add github:JIAQI23333/dsh-visual-plan`，
  prepare 构建成功、`--dump-config` 含插件层、web boot 通过、GUI probe 全绿（标签注册 + 视图挂载 + 0 控制台错误）。
- [ ] 首次 release tag（v0.1.0）与 CHANGELOG 对齐

### Plan ↔ Agent 状态边界（v0.1 已落地）

```text
Plan v1（Agent 生成）     reviewing     approvedVersion = null   executionVersion = null
        │ 用户 Apply
        ▼
Plan v2（用户批准）       executing     approvedVersion = 2      executionVersion = 2
        │ 后续草稿 v3
        ▼
Plan v3（新草稿）         draft         approvedVersion = 2      executionVersion = 2
```

执行永远绑定到 `approvedVersion` / `executionVersion`；回写消息显式声明批准版本，
并要求 Agent 执行中遇到变化时先提出新计划、由用户批准，而不是静默修改已批准的计划。

## v0.1.1 — 编辑基础体验与执行绑定（规划中）

按优先级：

- [ ] Undo / Redo（节点编辑器的基础体验，优先修补项）
- [ ] 快捷键：Delete、Cmd/Ctrl + Z、Cmd/Ctrl + Shift + Z、Cmd/Ctrl + S、Space（平移）、F（Fit View）
- [ ] Plan Snapshot：执行开始时保存执行快照，执行不再依赖 `current plan.json`
- [ ] Execution Version Lock：执行期间锁定 `executionVersion`，新草稿不得替换
- [ ] Bug Fixes（来自真实任务验证）

## v0.2 — 计划体验（规划中，按优先级排序）

- [ ] ⭐ 自然语言修改计划（NL Plan Editing）—— v0.2 头号功能：
  「把数据库迁移删除，API 和前端并行开发，测试放到最后」→ Canvas 自动变成对应的 DAG。
- [ ] ⭐ 文件变更预览（File Change Preview）—— 节点展开显示变更意图：
  `+ src/login.ts`、`~ src/auth.ts`、`- src/old-auth.ts`，让用户知道 Agent 准备动哪些文件。
- [ ] AI Plan Review —— 只做结构性检查，不做「AI 复评」：
  依赖 / 冗余 / 缺失 / 并行化 / 风险（Plan Health：✓ 无环、✓ 依赖有效、⚠ 冗余任务、⚠ 缺失测试、💡 可并行、🔴 高风险变更）。
- [ ] 评论增强（回复、状态、@）
- [ ] Focus Mode（v0.2.x，不阻塞主版本）：只显示当前节点 + 上游/下游，其他节点淡化。

## v0.3 — 执行可视化（规划中）

- [ ] 执行可视化：Plan ↔ Execution 统一图——同一个节点既是 Plan 又是 Execution
  （✓ Plan approved · 🟢 Running · Files: 3 · Tools: 7 · Duration: 02:13），不另做一套执行图。
- [ ] 并行执行：DAG 已表达并行（A → B/C → D）；执行引擎按
  `Visual Graph → Execution Planner → Dependency Resolution → Runnable Tasks → Agent` 识别互不依赖的节点。
- [ ] Sub-agent 图
- [ ] 动态重新规划（基于版本边界，不失控）

## v0.4 — 多 Agent（规划中）

- [ ] Generic Agent Protocol 先行：VisualPlan 作为不同 Agent 之间的统一计划交换格式
- [ ] DSH / Claude / Codex / Gemini 适配器（接入统一协议）

## v1.0 — 长期方向

- [ ] Agent Workflow IDE
- [ ] Multi-agent
- [ ] Advanced Re-planning
- [ ] Ecosystem

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

## 第一版明确不做

以下内容不进入 v0.1，避免为「以后可能需要」提前实现：

- 多 Agent / 多人实时协作
- Claude / Codex / Gemini 支持
- 云端同步
- MCP 工作流可视化
- 实时 Token / Reasoning 可视化
- 复杂评论系统 / Figma 风格协作
- 工作流市场 / 插件市场
- 快捷键（推迟到 v0.1.1，不阻塞 v0.1 发布）
