/**
 * VisualPlan data model — the unified machine interface for plans.
 *
 * Everything that leaves this package (host persistence, client canvas,
 * adapters, diff, revisions) speaks this IR. A plan is deliberately a flat
 * task graph: dependencies are explicit edges, so the UI, the diff engine
 * and the DSH write-back all agree on one source of truth.
 */

/** First-version task types. */
export const TASK_TYPES = ['analysis', 'design', 'coding', 'testing', 'refactor', 'other'] as const
export type TaskType = (typeof TASK_TYPES)[number]

/** First-version task statuses. */
export const TASK_STATUSES = ['pending', 'running', 'completed', 'failed', 'skipped'] as const
export type TaskStatus = (typeof TASK_STATUSES)[number]

/** First-version plan statuses. */
export const PLAN_STATUSES = ['draft', 'reviewing', 'approved', 'executing', 'completed', 'failed'] as const
export type PlanStatus = (typeof PLAN_STATUSES)[number]

/** One task in the plan graph. */
export interface PlanTask {
  id: string
  title: string
  description: string
  type: TaskType
  status: TaskStatus
  /** Ids of tasks this task depends on. */
  dependencies: string[]
  files?: string[]
  metadata: Record<string, unknown>
}

/** A directed dependency edge, derived from task.dependencies. */
export interface PlanEdge {
  id: string
  source: string
  target: string
}

/** A user comment attached to one task. */
export interface PlanComment {
  id: string
  taskId: string
  content: string
  author: string
  createdAt: number
}

/** One task identity used by diff summaries. */
export interface PlanTaskRef {
  id: string
  title: string
}

/** A dependency change on one task, used by diff summaries. */
export interface PlanDependencyChange {
  taskId: string
  title: string
  added: string[]
  removed: string[]
}

/** A comment change on one task. */
export interface PlanCommentChange {
  taskId: string
  added: number
  removed: number
}

/** The computed difference between two plan versions. */
export interface PlanDiff {
  added: PlanTaskRef[]
  removed: PlanTaskRef[]
  modified: Array<PlanTaskRef & { fields: string[] }>
  dependencyChanges: PlanDependencyChange[]
  commentChanges: PlanCommentChange[]
}

/** A frozen plan snapshot produced by Apply Changes. */
export interface PlanVersion {
  version: number
  timestamp: number
  changes: PlanDiff
  author: string
  plan: VisualPlan
}

/** The complete machine-readable plan. */
export interface VisualPlan {
  /** Stable plan id (session-derived for DSH plans). */
  id: string
  /** Current version number; 1 is the first approved plan. */
  version: number
  /**
   * Version approved by the user; null until the first Apply.
   * Execution is bound to this version — later drafts must never replace it.
   */
  approvedVersion: number | null
  /**
   * Version the agent is executing; null until execution starts.
   * Kept separate from `version` so a newer draft (v5) cannot silently
   * override an in-flight approved plan (v4).
   */
  executionVersion: number | null
  title: string
  goal: string
  status: PlanStatus
  tasks: PlanTask[]
  /** Derived from task.dependencies; kept in sync by helpers. */
  edges: PlanEdge[]
  comments: PlanComment[]
  metadata: Record<string, unknown>
}

/** Metadata-only view of a stored version (for revision listings). */
export interface PlanVersionMeta {
  version: number
  timestamp: number
  author: string
  changes: PlanDiff
  title: string
}

/** Validation problem severities returned by the validator. */
export interface PlanIssue {
  level: 'error' | 'warning'
  code:
    | 'missing-field'
    | 'invalid-type'
    | 'duplicate-id'
    | 'invalid-dependency'
    | 'self-dependency'
    | 'duplicate-edge'
    | 'invalid-edge'
    | 'circular-dependency'
    | 'invalid-version-bound'
    | 'status-version-inconsistency'
    | 'empty-plan'
  message: string
  /** Task id the issue belongs to, when scoped. */
  taskId?: string
}

/** Result of validating and (optionally) repairing a plan. */
export interface PlanValidationResult {
  ok: boolean
  issues: PlanIssue[]
  plan: VisualPlan | null
}
