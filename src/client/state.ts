/**
 * Plan editor state machine.
 *
 * Holds the approved base plan and the user's working copy. All mutations go
 * through `planReducer` (immutable updates); dependencies stay the single
 * source of truth and edges are re-derived after every change. Adding a
 * dependency that would create a cycle is rejected with an error.
 */

import { deriveEdges } from '../engine/markdown.ts'
import { diffPlans, isDiffEmpty } from '../engine/diff.ts'
import { hasCycle } from '../schema/validate.ts'
import { canTransitionPlan } from '../schema/state.ts'
import type { PlanComment, PlanDiff, PlanTask, VisualPlan } from '../schema/types.ts'

/** Undo/redo history depth cap (v0.1.1). */
export const HISTORY_LIMIT = 100

export interface PlanEditorState {
  /** The last approved plan (extracted or submitted). */
  base: VisualPlan
  /** The working copy under edit. */
  current: VisualPlan
  /** Previous working copies, newest last; capped at HISTORY_LIMIT. */
  past: VisualPlan[]
  /** Undone working copies, oldest first (for redo). */
  future: VisualPlan[]
  /** True while the working copy differs from base. */
  dirty: boolean
  /** Last reducer rejection, as a stable i18n key + params. */
  error: PlanError | null
}

/** Stable error identity so the UI can localize without parsing messages. */
export interface PlanError {
  code: 'circular' | 'selfDependency' | 'taskNotFound' | 'duplicateId'
  params?: Record<string, string>
}

export type PlanAction =
  | { type: 'reset'; plan: VisualPlan }
  | { type: 'discard' }
  | { type: 'applied' }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'editTask'; taskId: string; patch: Partial<Omit<PlanTask, 'id'>> }
  | { type: 'addTask'; task: Omit<PlanTask, 'id'> & { id?: string } }
  | { type: 'deleteTask'; taskId: string }
  | { type: 'addDependency'; taskId: string; dependencyId: string }
  | { type: 'removeDependency'; taskId: string; dependencyId: string }
  | { type: 'addComment'; taskId: string; content: string; author: string }
  | { type: 'removeComment'; commentId: string }

export function createEditorState(plan: VisualPlan): PlanEditorState {
  return { base: plan, current: plan, past: [], future: [], dirty: false, error: null }
}

function clonePlan(plan: VisualPlan): VisualPlan {
  return JSON.parse(JSON.stringify(plan)) as VisualPlan
}

function nextTaskId(tasks: readonly PlanTask[]): string {
  const max = tasks.reduce((m, t) => {
    const n = Number(/^task_(\d+)$/.exec(t.id)?.[1] ?? 0)
    return Math.max(m, n)
  }, 0)
  return `task_${String(max + 1).padStart(3, '0')}`
}

function nextCommentId(comments: readonly PlanComment[]): string {
  const max = comments.reduce((m, c) => {
    const n = Number(/^comment_(\d+)$/.exec(c.id)?.[1] ?? 0)
    return Math.max(m, n)
  }, 0)
  return `comment_${String(max + 1).padStart(3, '0')}`
}

/**
 * Record a mutation: push the pre-mutation working copy into the undo stack
 * and drop the redo stack.
 */
function pushHistory(prev: PlanEditorState, next: PlanEditorState): PlanEditorState {
  return { ...next, past: [...prev.past, clonePlan(prev.current)].slice(-HISTORY_LIMIT), future: [] }
}

export function planReducer(state: PlanEditorState, action: PlanAction): PlanEditorState {
  switch (action.type) {
    case 'reset':
      return createEditorState(action.plan)

    case 'discard':
      return { ...state, current: clonePlan(state.base), past: [], future: [], dirty: false, error: null }

    case 'applied': {
      // Approving a revision bumps the version and moves the plan into
      // execution (v1 → v2 → v3 …, per the versioning contract). The new
      // version is simultaneously the approved version and the version bound
      // to execution: a later draft must never silently replace it.
      if (state.base.status !== 'executing' && !canTransitionPlan(state.base.status, 'executing')) return state
      const next = clonePlan(state.current)
      next.version = state.base.version + 1
      next.status = 'executing'
      next.approvedVersion = next.version
      // Execution Version Lock: once bound, executionVersion is write-once.
      // A later approval (v5) while v4 is executing only bumps approvedVersion.
      next.executionVersion = state.base.executionVersion ?? next.version
      return { ...state, base: next, current: next, past: [], future: [], dirty: false, error: null }
    }

    case 'undo': {
      if (state.past.length === 0) return state
      const previous = state.past[state.past.length - 1]!
      const current = clonePlan(previous)
      return {
        ...state,
        current,
        past: state.past.slice(0, -1),
        future: [clonePlan(state.current), ...state.future],
        dirty: !isDiffEmpty(diffPlans(state.base, current)),
        error: null,
      }
    }

    case 'redo': {
      if (state.future.length === 0) return state
      const next = state.future[0]!
      const current = clonePlan(next)
      return {
        ...state,
        current,
        past: [...state.past, clonePlan(state.current)].slice(-HISTORY_LIMIT),
        future: state.future.slice(1),
        dirty: !isDiffEmpty(diffPlans(state.base, current)),
        error: null,
      }
    }

    case 'editTask': {
      const current = clonePlan(state.current)
      const task = current.tasks.find((t) => t.id === action.taskId)
      if (!task) return { ...state, error: { code: 'taskNotFound', params: { id: action.taskId } } }
      Object.assign(task, action.patch)
      current.edges = deriveEdges(current.tasks)
      return pushHistory(state, { ...state, current, dirty: true, error: null })
    }

    case 'addTask': {
      const current = clonePlan(state.current)
      const id = action.task.id ?? nextTaskId(current.tasks)
      if (current.tasks.some((t) => t.id === id)) return { ...state, error: { code: 'duplicateId', params: { id } } }
      current.tasks.push({
        id,
        title: action.task.title,
        description: action.task.description,
        type: action.task.type,
        status: action.task.status,
        dependencies: action.task.dependencies ?? [],
        files: action.task.files,
        metadata: action.task.metadata ?? {},
      })
      current.edges = deriveEdges(current.tasks)
      return pushHistory(state, { ...state, current, dirty: true, error: null })
    }

    case 'deleteTask': {
      const current = clonePlan(state.current)
      if (!current.tasks.some((t) => t.id === action.taskId)) {
        return { ...state, error: { code: 'taskNotFound', params: { id: action.taskId } } }
      }
      current.tasks = current.tasks
        .filter((t) => t.id !== action.taskId)
        .map((t) => ({
          ...t,
          dependencies: t.dependencies.filter((d) => d !== action.taskId),
        }))
      current.comments = current.comments.filter((c) => c.taskId !== action.taskId)
      current.edges = deriveEdges(current.tasks)
      return pushHistory(state, { ...state, current, dirty: true, error: null })
    }

    case 'addDependency': {
      if (action.taskId === action.dependencyId) {
        return { ...state, error: { code: 'selfDependency' } }
      }
      const current = clonePlan(state.current)
      const task = current.tasks.find((t) => t.id === action.taskId)
      if (!task) return { ...state, error: { code: 'taskNotFound', params: { id: action.taskId } } }
      if (task.dependencies.includes(action.dependencyId)) return state
      task.dependencies.push(action.dependencyId)
      current.edges = deriveEdges(current.tasks)
      if (hasCycle(current)) {
        return { ...state, error: { code: 'circular' } }
      }
      return pushHistory(state, { ...state, current, dirty: true, error: null })
    }

    case 'removeDependency': {
      const current = clonePlan(state.current)
      const task = current.tasks.find((t) => t.id === action.taskId)
      if (!task) return state
      task.dependencies = task.dependencies.filter((d) => d !== action.dependencyId)
      current.edges = deriveEdges(current.tasks)
      return pushHistory(state, { ...state, current, dirty: true, error: null })
    }

    case 'addComment': {
      const content = action.content.trim()
      if (content === '') return state
      const current = clonePlan(state.current)
      if (!current.tasks.some((t) => t.id === action.taskId)) return state
      current.comments.push({
        id: nextCommentId(current.comments),
        taskId: action.taskId,
        content,
        author: action.author,
        createdAt: Date.now(),
      })
      return pushHistory(state, { ...state, current, dirty: true, error: null })
    }

    case 'removeComment': {
      const current = clonePlan(state.current)
      const before = current.comments.length
      current.comments = current.comments.filter((c) => c.id !== action.commentId)
      if (current.comments.length === before) return state
      return pushHistory(state, { ...state, current, dirty: true, error: null })
    }
  }
}

/** Tasks that depend on the given task (used by the delete confirmation). */
export function dependentsOf(plan: VisualPlan, taskId: string): PlanTask[] {
  return plan.tasks.filter((t) => t.dependencies.includes(taskId))
}

/** Convenience: compute the diff between base and current. */
export function currentDiff(state: PlanEditorState): PlanDiff {
  return diffPlans(state.base, state.current)
}
