/**
 * Explicit plan lifecycle state machine (v0.1.1).
 *
 * Transitions are the single source of truth for `plan.status` changes.
 * v0.1's Apply performs approve + handoff atomically (reviewing → executing);
 * `approved` is reserved for when approval and execution start are separated
 * (execution tracking, v0.3). Validation uses these rules for consistency
 * warnings — stored plans are never rewritten, keeping `.plan/` backward
 * compatible.
 */

import type { PlanStatus } from './types.ts'

/** Allowed transitions per source status. */
export const PLAN_TRANSITIONS: Record<PlanStatus, readonly PlanStatus[]> = {
  draft: ['reviewing'],
  reviewing: ['approved', 'executing'],
  approved: ['executing'],
  executing: ['completed', 'failed'],
  completed: [],
  failed: [],
}

/** True when `from → to` is an allowed lifecycle transition. */
export function canTransitionPlan(from: PlanStatus, to: PlanStatus): boolean {
  return PLAN_TRANSITIONS[from]?.includes(to) ?? false
}

/** Flat transition list, for docs and tests. */
export const PLAN_TRANSITION_LIST: ReadonlyArray<{ from: PlanStatus; to: PlanStatus }> = Object.entries(
  PLAN_TRANSITIONS,
).flatMap(([from, tos]) => tos.map((to) => ({ from: from as PlanStatus, to })))
