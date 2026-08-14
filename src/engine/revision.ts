/**
 * Plan versioning: Apply Changes produces a new frozen PlanVersion.
 *
 * Versions are never overwritten; every apply appends a new snapshot
 * (v1 → v2 → v3 …), satisfying the "all user changes must be traceable"
 * requirement.
 */

import type { PlanDiff, PlanVersion, VisualPlan } from '../schema/types.ts'

/**
 * Create a new version snapshot.
 *
 * @param previous - the previous version (or the extracted base plan).
 * @param next - the approved working copy.
 * @param author - who approved the change ('user' for the Web UI).
 * @param changes - precomputed diff; when omitted it is computed here.
 */
export function createPlanVersion(
  previous: VisualPlan | null,
  next: VisualPlan,
  author: string,
  changes?: PlanDiff,
): PlanVersion {
  const version = (previous?.version ?? 0) + 1
  return {
    version,
    timestamp: Date.now(),
    changes: changes ?? { added: [], removed: [], modified: [], dependencyChanges: [], commentChanges: [] },
    author,
    plan: JSON.parse(JSON.stringify(next)) as VisualPlan,
  }
}
