# dsh-visual-plan

Visual Plan mode for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness):
the plan the agent produces in plan mode (`exit_plan_mode`) becomes an editable
node graph. Users add / delete / edit tasks, rewire dependencies, attach
comments, and submit the approved revision back to DSH, which continues
execution from the revised plan.

## Architecture

```text
DSH Plan Mode (exit_plan_mode markdown)
        │
        ▼
DeepSeekHarnessAdapter ──► VisualPlan JSON (single machine interface)
        │                              │
        ▼                              ▼
   revised message              React Flow canvas (editable)
        │                              │
        └────────── Apply Changes ◄────┘
                      │
                      ▼
               Plan Diff → confirm
                      │
                      ▼
          .plan/plan.json + plan.md + revisions/vN.json   (host persistence)
                      │
                      ▼
          revised plan sent back to DSH → execution
```

The plugin is split into:

- `src/schema` — VisualPlan / Task / Edge / Comment / Version types + validation
  (dependency existence, self-dependency, circular-dependency detection).
- `src/engine` — markdown ⇄ plan conversion, plan diff, version creation.
- `src/adapter` — source-agnostic adapter seam; v1 ships the DSH adapter
  (`exit_plan_mode` → VisualPlan, VisualPlan → revised-plan message).
- `src/index.ts` — host face: atomic persistence routes for `.plan/` files.
- `src/client` — the Visual Plan tab (React Flow canvas, task editor,
  comments, diff dialog, Apply Changes).

## Development

```sh
npm install
npm run typecheck   # host + client type checks
npm run build       # tsc host + client, then tsdown client bundle
npm run verify      # offline contract + pure-logic verification
```

## E2E

With a running DSH web profile that composes this package (`dsh --profile web`):

```sh
node scripts/gui-probe.mjs [url]        # tab registration + view mounting
node scripts/e2e-plan-flow.mjs [url]    # /plan → approve → nodes on canvas
```

The full plan-flow script needs a working model and completes the acceptance
chain: plan mode → `exit_plan_mode` → VisualPlan → canvas.

## Data layout

Each approved plan is stored in the session's workspace:

```text
.plan/
├── plan.json          latest VisualPlan
├── plan.md            latest markdown (agent-readable)
└── revisions/
    ├── v1.json        immutable approved snapshots
    └── v2.json
```

## Scope (v1)

In scope: structured plan + markdown, node graph, add/edit/delete tasks,
dependency edges, comments, plan diff, versioned revisions, DSH write-back.

Out of scope (future): multi-agent, Claude/Codex/Gemini adapters, real-time
collaboration, execution visualization, AI plan review.
