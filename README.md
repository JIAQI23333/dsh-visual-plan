<div align="center">

# dsh-visual-plan

**简体中文** · [English](./README.en.md)

为 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（`dsh`）提供**可视化计划模式**：
Agent 在 Plan Mode 中生成的计划会自动变成一张可编辑的节点图。你可以拖动节点、修改依赖、添加批注，
确认后系统生成 Plan Diff、创建新版本，并把用户批准的修订计划可靠地交还给 DSH 继续执行。

</div>

## 核心流程

```text
用户需求 → DSH Plan Mode → 结构化 VisualPlan JSON → 节点图画布
        → 查看 / 编辑 / 批注 → Apply Changes → Plan Diff → 用户确认
        → 生成新版本（v1 → v2 → …）→ 修订计划回写 DSH → 按批准的计划执行
```

## 特性

- **计划自动可视化**：Plan Mode 的 `exit_plan_mode` 输出自动转为 VisualPlan JSON，并用 DAG 自动布局渲染为节点图（节点不重叠、依赖清晰）。
- **完整编辑能力**：新增 / 删除 / 编辑任务，拖拽修改依赖关系，任务类型与状态一目了然。
- **批注系统**：给任意任务添加评论，随版本一起保存、可追溯。
- **Plan Diff**：提交前展示新增 / 删除 / 修改 / 依赖变更，用户确认后才写入。
- **版本化存储**：每次 Apply 生成不可变新版本（`.plan/revisions/vN.json`），绝不覆盖用户已批准的计划。
- **可靠回写**：以明确的修订消息把**批准版本（Plan vN）**交还 Agent，Agent 按该版本继续执行；
  执行中遇到变化不得静默修改已批准的计划，必须先提出新计划由用户批准。
- **数据双轨**：`plan.json`（机器接口）+ `plan.md`（人类 / Agent 阅读、Git 保存、调试）。
- **Plan ↔ Agent 状态边界**：`plan.status / version / approvedVersion / executionVersion`，
  执行绑定到批准版本，为后续动态重新规划打好基础。
- **健壮性**：JSON 校验、依赖不存在检测、循环依赖检测；解析失败时回退 Markdown 计划。
- **界面能力**：主题跟随 / 白天 / 黑夜、地图开关、全屏、交互开关、左下角高对比度控件。
- **国际化**：中文 / English，跟随 DSH 自带 Language 设置（默认中文）。
- **与 DSH 解耦**：UI 与 Agent Core 隔离；关闭插件后 DSH 原有 Plan Mode 完全不受影响。

## 安装

> 需要 DSH `>= 0.1.0-rc.6`（当前验证于 `0.1.0-rc.6`）。

### 本地目录（开发中）

```sh
dsh plugin --profile web add /path/to/dsh-visual-plan
```

### GitHub（发布后）

```sh
dsh plugin --profile web add github:<owner>/dsh-visual-plan
```

> pnpm ≥ 10 首次安装 Git 依赖会拒绝执行 `prepare` 构建脚本，按提示把 `dsh-visual-plan`
> 加入 profile 的 `pnpm-workspace.yaml` 的 `allowBuilds` 后重试即可。

安装后验证配置层并重启：

```sh
dsh --profile web --dump-config   # 应看到 "dsh-visual-plan" 层
dsh --profile web
```

## 使用

1. 在 Web GUI（`dsh web`，默认 `http://127.0.0.1:3080`）打开一个会话，进入 Plan Mode 并生成计划。
2. 切换到「可视化计划」标签（位于「对话」与「轨迹」之间）。
3. 编辑节点：拖拽 / 缩放 / 平移画布，点击节点打开编辑面板，修改标题、描述、类型、状态、依赖；
   也可新增或删除任务、添加批注。
4. 点击「应用修改」，在 Diff 弹窗中确认。
5. DSH 创建新版本，并按修订后的计划继续执行。

## 架构

```text
DSH Plan Mode (exit_plan_mode markdown)
        │
        ▼
DeepSeekHarnessAdapter ──► VisualPlan JSON（唯一机器接口）
        │                              │
        ▼                              ▼
   revised message              React Flow canvas（可编辑）
        │                              │
        └────────── Apply Changes ◄────┘
                      │
                      ▼
               Plan Diff → 用户确认
                      │
                      ▼
        .plan/plan.json + plan.md + revisions/vN.json
                      │
                      ▼
          修订计划回写 DSH → 按批准的计划执行
```

模块划分：

- `src/schema` — VisualPlan / Task / Edge / Comment / Version 类型与校验（依赖存在性、自依赖、循环依赖检测）。
- `src/engine` — Markdown ⇄ Plan 转换、Plan Diff、版本创建。
- `src/adapter` — 适配器接缝；v1 提供 DSH 适配器（`exit_plan_mode` → VisualPlan，VisualPlan → 修订计划消息）。
- `src/index.ts` — host 面：`.plan/` 持久化与回环 API。
- `src/client` — 「可视化计划」标签页（React Flow 画布、任务编辑器、评论、Diff 弹窗、Apply）。

## 数据布局

每次批准的计划保存在会话工作区：

```text
.plan/
├── plan.json      最新 VisualPlan
├── plan.md        最新 Markdown（Agent 可读）
└── revisions/
    ├── v1.json    不可变的批准快照
    └── v2.json
```

## 版本与执行边界

每次 Apply 都会把新版本同时记为 `approvedVersion` 与 `executionVersion`：

```text
Plan v1（Agent 生成）     reviewing     approvedVersion = null   executionVersion = null
        │ 用户 Apply
        ▼
Plan v2（用户批准）       executing     approvedVersion = 2      executionVersion = 2
        │ 后续草稿 v3
        ▼
Plan v3（新草稿）         draft         approvedVersion = 2      executionVersion = 2
```

执行永远绑定到批准版本；即使后续生成了更新的草稿，正在执行的版本也不会被悄悄替换。

## 本地开发

```sh
npm install
npm run typecheck   # host + client 类型检查
npm run build       # host + client 构建
npm run verify      # 离线契约 + 纯逻辑验证（77 项）
```

## E2E

配合运行中的 DSH web profile（已组合本包）：

```sh
node scripts/gui-probe.mjs [url]        # tab 注册 + 视图挂载
node scripts/e2e-plan-flow.mjs [url]    # /plan → 批准 → 画布节点
```

完整 plan-flow 脚本需要可用的模型，覆盖验收链路：
Plan Mode → `exit_plan_mode` → VisualPlan → 画布。

## 路线图与更新日志

- [路线图（ROADMAP.md）](./ROADMAP.md)
- [更新日志（CHANGELOG.md）](./CHANGELOG.md)

## 相关文档

- [DSH 插件开发入门](https://github.com/deepseek-ai/deepseek-harness/blob/main/docs/user/develop/basic/index.zh.md)
- [DSH 插件配置](https://github.com/deepseek-ai/deepseek-harness/blob/main/docs/user/develop/basic/config.zh.md)
- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)

## License

[MIT](./LICENSE)
