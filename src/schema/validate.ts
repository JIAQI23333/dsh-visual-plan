/**
 * VisualPlan validation.
 *
 * Structural checks (shape, enums, ids, edges) plus semantic checks
 * (dependency existence, cycles). `validatePlan` never throws for user data;
 * it reports issues. A repaired plan has invalid references dropped so the UI
 * can still render; cycles are never auto-broken — Apply must block on them.
 */

import {
  PLAN_STATUSES,
  TASK_STATUSES,
  TASK_TYPES,
  type PlanComment,
  type PlanEdge,
  type PlanIssue,
  type PlanTask,
  type PlanValidationResult,
  type VisualPlan,
} from './types.ts'

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isString)
}

/** Detect a dependency cycle via iterative DFS; returns the cycle ids. */
export function findCycle(
  tasks: ReadonlyMap<string, PlanTask>,
  start = tasks.keys().next().value as string | undefined,
): string[] | null {
  if (start === undefined) return null
  const state = new Map<string, 0 | 1 | 2>() // 0 unvisited, 1 in-stack, 2 done
  const stack: string[] = []

  const visit = (id: string): string[] | null => {
    state.set(id, 1)
    stack.push(id)
    const task = tasks.get(id)
    if (task) {
      for (const dep of task.dependencies) {
        const s = state.get(dep)
        if (s === 1) {
          const cycleStart = stack.indexOf(dep)
          return [...stack.slice(cycleStart), dep]
        }
        if (s === undefined || s === 0) {
          const cycle = visit(dep)
          if (cycle) return cycle
        }
      }
    }
    stack.pop()
    state.set(id, 2)
    return null
  }

  for (const id of tasks.keys()) {
    if (state.get(id) === undefined || state.get(id) === 0) {
      const cycle = visit(id)
      if (cycle) return cycle
    }
  }
  return null
}

/** True when the plan's dependency graph contains a cycle. */
export function hasCycle(plan: VisualPlan): boolean {
  return findCycle(new Map(plan.tasks.map((t) => [t.id, t]))) !== null
}

/**
 * Validate (and optionally repair) a plan-like value.
 *
 * @param input - any JSON-decoded value.
 * @param options.repair - when true, invalid dependencies/edges are dropped
 *   and duplicates are deduplicated so the UI can render; cycles remain
 *   errors because silently breaking a cycle would change user intent.
 */
export function validatePlan(input: unknown, options: { repair?: boolean } = {}): PlanValidationResult {
  const issues: PlanIssue[] = []
  const repair = options.repair ?? false
  if (!isRecord(input)) {
    return { ok: false, issues: [{ level: 'error', code: 'missing-field', message: 'Plan is not a JSON object.' }], plan: null }
  }

  const id = isString(input.id) ? input.id : ''
  const title = isString(input.title) ? input.title : ''
  const goal = isString(input.goal) ? input.goal : ''
  const status = isString(input.status) && PLAN_STATUSES.includes(input.status as VisualPlan['status'])
    ? input.status as VisualPlan['status']
    : 'reviewing'
  const version = typeof input.version === 'number' && Number.isInteger(input.version) && input.version >= 1
    ? input.version
    : 1
  let approvedVersion = readVersionBound(input.approvedVersion, 'approvedVersion', issues)
  let executionVersion = readVersionBound(input.executionVersion, 'executionVersion', issues)
  // Version bounds must never point past the current plan version: a bound
  // above `version` would claim an approval/execution that this plan cannot
  // represent, so it is repaired to null with a warning.
  if (approvedVersion !== null && approvedVersion > version) {
    issues.push({
      level: 'warning',
      code: 'invalid-version-bound',
      message: `"approvedVersion" (${approvedVersion}) cannot exceed the current version (${version}); reset to null.`,
    })
    approvedVersion = null
  }
  if (executionVersion !== null && executionVersion > version) {
    issues.push({
      level: 'warning',
      code: 'invalid-version-bound',
      message: `"executionVersion" (${executionVersion}) cannot exceed the current version (${version}); reset to null.`,
    })
    executionVersion = null
  }
  const metadata = isRecord(input.metadata) ? input.metadata : {}

  if (id === '') issues.push({ level: 'error', code: 'missing-field', message: 'Plan is missing "id".' })
  if (title === '') issues.push({ level: 'error', code: 'missing-field', message: 'Plan is missing "title".' })
  if (!Array.isArray(input.tasks)) {
    return { ok: false, issues: [{ level: 'error', code: 'missing-field', message: 'Plan is missing "tasks".' }], plan: null }
  }

  // --- Tasks ---
  const seenIds = new Set<string>()
  const tasks: PlanTask[] = []
  for (const raw of input.tasks) {
    if (!isRecord(raw) || !isString(raw.id) || raw.id === '') {
      issues.push({ level: 'error', code: 'missing-field', message: 'A task is missing a valid "id".' })
      continue
    }
    if (seenIds.has(raw.id)) {
      issues.push({ level: 'error', code: 'duplicate-id', message: `Duplicate task id "${raw.id}".` })
      continue
    }
    seenIds.add(raw.id)
    const task: PlanTask = {
      id: raw.id,
      title: isString(raw.title) ? raw.title : '',
      description: isString(raw.description) ? raw.description : '',
      type: isString(raw.type) && TASK_TYPES.includes(raw.type as PlanTask['type'])
        ? raw.type as PlanTask['type']
        : 'other',
      status: isString(raw.status) && TASK_STATUSES.includes(raw.status as PlanTask['status'])
        ? raw.status as PlanTask['status']
        : 'pending',
      dependencies: isStringArray(raw.dependencies) ? [...raw.dependencies] : [],
      files: isStringArray(raw.files) ? [...raw.files] : undefined,
      metadata: isRecord(raw.metadata) ? raw.metadata : {},
    }
    if (task.title === '') issues.push({ level: 'error', code: 'missing-field', message: `Task "${task.id}" is missing a title.` })
    tasks.push(task)
  }

  if (tasks.length === 0) {
    return { ok: false, issues: [...issues, { level: 'error', code: 'empty-plan', message: 'Plan has no tasks.' }], plan: null }
  }

  // --- Dependencies ---
  const byId = new Map(tasks.map((t) => [t.id, t]))
  for (const task of tasks) {
    const kept: string[] = []
    for (const dep of task.dependencies) {
      if (dep === task.id) {
        issues.push({ level: repair ? 'warning' : 'error', code: 'self-dependency', message: `Task "${task.id}" depends on itself.`, taskId: task.id })
        if (!repair) kept.push(dep)
        continue
      }
      if (!byId.has(dep)) {
        issues.push({ level: repair ? 'warning' : 'error', code: 'invalid-dependency', message: `Invalid dependency: ${dep} (task "${task.id}").`, taskId: task.id })
        if (!repair) kept.push(dep)
        continue
      }
      if (!kept.includes(dep)) kept.push(dep)
    }
    task.dependencies = kept
  }

  // --- Cycle detection ---
  const cycle = findCycle(byId)
  if (cycle) {
    issues.push({ level: 'error', code: 'circular-dependency', message: `Circular dependency detected: ${cycle.join(' → ')}.` })
  }

  // --- Edges (re-derived from dependencies; ignore stale input) ---
  const edges: PlanEdge[] = []
  const edgeSeen = new Set<string>()
  for (const task of tasks) {
    for (const dep of task.dependencies) {
      const key = `${dep}->${task.id}`
      if (edgeSeen.has(key)) continue
      edgeSeen.add(key)
      edges.push({ id: key, source: dep, target: task.id })
    }
  }

  // --- Comments ---
  const comments: PlanComment[] = []
  const commentSeen = new Set<string>()
  const rawComments = Array.isArray(input.comments) ? input.comments : []
  for (const raw of rawComments) {
    if (!isRecord(raw) || !isString(raw.id) || !isString(raw.taskId) || !isString(raw.content)) continue
    if (commentSeen.has(raw.id)) continue
    if (!byId.has(raw.taskId)) {
      issues.push({ level: repair ? 'warning' : 'error', code: 'invalid-edge', message: `Comment "${raw.id}" references unknown task "${raw.taskId}".`, taskId: raw.taskId })
      if (!repair) {
        comments.push({
          id: raw.id,
          taskId: raw.taskId,
          content: raw.content,
          author: isString(raw.author) ? raw.author : 'user',
          createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : Date.now(),
        })
      }
      continue
    }
    commentSeen.add(raw.id)
    comments.push({
      id: raw.id,
      taskId: raw.taskId,
      content: raw.content,
      author: isString(raw.author) ? raw.author : 'user',
      createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : Date.now(),
    })
  }

  const plan: VisualPlan = {
    id,
    title,
    goal,
    status,
    version,
    approvedVersion,
    executionVersion,
    tasks,
    edges,
    comments,
    metadata,
  }
  const errors = issues.filter((i) => i.level === 'error')
  return { ok: errors.length === 0, issues, plan }
}

/**
 * Read an optional version bound (approvedVersion / executionVersion).
 * Missing/null stays null; present-but-invalid values are repaired to null
 * with a warning so a corrupt plan can still load without binding execution
 * to a nonsense version.
 */
function readVersionBound(
  value: unknown,
  field: string,
  issues: PlanIssue[],
): number | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'number' && Number.isInteger(value) && value >= 1) return value
  issues.push({
    level: 'warning',
    code: 'invalid-version-bound',
    message: `"${field}" must be a positive integer (got ${JSON.stringify(value)}); reset to null.`,
  })
  return null
}
