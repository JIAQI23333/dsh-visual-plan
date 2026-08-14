/**
 * Plan diff engine: computes what changed between two plan versions.
 *
 * Comparison is by task id: added/removed tasks, modified fields
 * (title/description/type/status/files), dependency changes and comment
 * changes. Used both by the Apply Changes dialog and the write-back message.
 */

import type { PlanDiff, PlanTask, VisualPlan } from '../schema/types.ts'

const COMPARED_FIELDS = ['title', 'description', 'type', 'status', 'files'] as const

/** Compute the difference between an original and a current plan. */
export function diffPlans(original: VisualPlan, current: VisualPlan): PlanDiff {
  const originalTasks = new Map(original.tasks.map((t) => [t.id, t]))
  const currentTasks = new Map(current.tasks.map((t) => [t.id, t]))

  const added: PlanDiff['added'] = []
  const removed: PlanDiff['removed'] = []
  const modified: PlanDiff['modified'] = []
  const dependencyChanges: PlanDiff['dependencyChanges'] = []

  for (const task of current.tasks) {
    if (!originalTasks.has(task.id)) {
      added.push({ id: task.id, title: task.title })
    }
  }
  for (const task of original.tasks) {
    if (!currentTasks.has(task.id)) {
      removed.push({ id: task.id, title: task.title })
    }
  }

  for (const task of current.tasks) {
    const before = originalTasks.get(task.id)
    if (!before) continue
    const fields = COMPARED_FIELDS.filter((f) => {
      const a = before[f]
      const b = task[f]
      return JSON.stringify(a) !== JSON.stringify(b)
    })
    if (fields.length > 0) {
      modified.push({ id: task.id, title: task.title, fields })
    }

    const beforeDeps = new Set(before.dependencies)
    const afterDeps = new Set(task.dependencies)
    const addedDeps = [...afterDeps].filter((d) => !beforeDeps.has(d))
    const removedDeps = [...beforeDeps].filter((d) => !afterDeps.has(d))
    if (addedDeps.length > 0 || removedDeps.length > 0) {
      dependencyChanges.push({
        taskId: task.id,
        title: task.title,
        added: addedDeps,
        removed: removedDeps,
      })
    }
  }

  // Comment changes, per task.
  const countByTask = (plan: VisualPlan): Map<string, number> => {
    const map = new Map<string, number>()
    for (const c of plan.comments) map.set(c.taskId, (map.get(c.taskId) ?? 0) + 1)
    return map
  }
  const beforeComments = countByTask(original)
  const afterComments = countByTask(current)
  const commentChanges: PlanDiff['commentChanges'] = []
  const taskIds = new Set([...beforeComments.keys(), ...afterComments.keys()])
  for (const taskId of taskIds) {
    const before = beforeComments.get(taskId) ?? 0
    const after = afterComments.get(taskId) ?? 0
    if (before !== after) {
      commentChanges.push({
        taskId,
        added: Math.max(0, after - before),
        removed: Math.max(0, before - after),
      })
    }
  }

  return { added, removed, modified, dependencyChanges, commentChanges }
}

/** True when the diff is empty (no user-visible change). */
export function isDiffEmpty(diff: PlanDiff): boolean {
  return diff.added.length === 0
    && diff.removed.length === 0
    && diff.modified.length === 0
    && diff.dependencyChanges.length === 0
    && diff.commentChanges.length === 0
}

/** Human-readable diff summary (used in the write-back message and dialog). */
export function formatDiff(diff: PlanDiff): string {
  const lines: string[] = []
  if (diff.removed.length > 0) {
    lines.push('REMOVED')
    for (const t of diff.removed) lines.push(`- ${t.title}`)
  }
  if (diff.modified.length > 0) {
    lines.push('MODIFIED')
    for (const t of diff.modified) lines.push(`- ${t.title} (${t.fields.join(', ')})`)
  }
  if (diff.added.length > 0) {
    lines.push('ADDED')
    for (const t of diff.added) lines.push(`+ ${t.title}`)
  }
  if (diff.dependencyChanges.length > 0) {
    lines.push('DEPENDENCY CHANGED')
    for (const c of diff.dependencyChanges) {
      const bits: string[] = []
      if (c.added.length > 0) bits.push(`+ ${c.added.join(', ')}`)
      if (c.removed.length > 0) bits.push(`- ${c.removed.join(', ')}`)
      lines.push(`${c.title}: ${bits.join(' ')}`)
    }
  }
  if (diff.commentChanges.length > 0) {
    lines.push('COMMENTS')
    for (const c of diff.commentChanges) {
      lines.push(`${c.taskId}: ${c.added > 0 ? `+${c.added} added ` : ''}${c.removed > 0 ? `-${c.removed} removed` : ''}`)
    }
  }
  return lines.join('\n')
}

/** Serialize a task's comparable fields for deep equality checks. */
export function taskSignature(task: PlanTask): string {
  return JSON.stringify([task.title, task.description, task.type, task.status, task.files ?? []])
}
