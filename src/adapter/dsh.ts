/**
 * DeepSeek Harness adapter.
 *
 * DSH's plan mode delivers a complete plan as the markdown `plan` argument of
 * an `exit_plan_mode` tool call. This adapter:
 *  1. detects `exit_plan_mode` events in the session log snapshot,
 *  2. parses the latest plan markdown into a VisualPlan,
 *  3. serializes an approved VisualPlan back to markdown + a revised-plan
 *     message that DSH can execute against.
 */

import { parsePlanMarkdown, resolveDependencies, deriveEdges, serializePlanMarkdown, looksLikePlan } from '../engine/markdown.ts'
import { validatePlan } from '../schema/validate.ts'
import type { PlanTask, VisualPlan } from '../schema/types.ts'
import type { PlanAdapter, PlanAdapterContext, PlanExtractResult, PlanRawEvent } from './types.ts'
import type { PlanDiff } from '../schema/types.ts'
import { formatDiff } from '../engine/diff.ts'

/** The DSH plan-mode exit tool name. */
export const EXIT_PLAN_MODE = 'exit_plan_mode'

/** Parse the `plan` argument out of a tool call's raw JSON arguments. */
export function parsePlanArgs(argsRaw: string): string | null {
  try {
    const parsed: unknown = JSON.parse(argsRaw)
    if (parsed !== null && typeof parsed === 'object') {
      const plan = (parsed as Record<string, unknown>).plan
      if (typeof plan === 'string' && plan.trim() !== '') return plan
    }
  } catch {
    // Some providers pass the plan verbatim as a plain string.
    const trimmed = argsRaw.trim()
    if (looksLikePlan(trimmed)) return trimmed
  }
  return null
}

/** True when an event is an `exit_plan_mode` tool call/result. */
export function isPlanEvent(event: PlanRawEvent): boolean {
  if (event.kind === 'tool-result' || event.kind === 'tool-call' || event.kind === 'tool/result' || event.kind === 'tool/call') {
    return event.toolName === EXIT_PLAN_MODE || (event.argsRaw ?? '').includes(EXIT_PLAN_MODE)
  }
  return false
}

/** All distinct plan markdowns in the event list, oldest first. */
export function extractPlanMarkdowns(events: readonly PlanRawEvent[]): string[] {
  const planEvents = events.filter(isPlanEvent).sort((a, b) => a.seq - b.seq)
  const seen = new Set<string>()
  const markdowns: string[] = []
  for (const event of planEvents) {
    const markdown = parsePlanArgs(event.argsRaw ?? '')
    if (markdown === null || seen.has(markdown)) continue
    seen.add(markdown)
    markdowns.push(markdown)
  }
  return markdowns
}

/** Latest distinct plan markdown, or null when no plan exists in the events. */
export function latestPlanMarkdown(events: readonly PlanRawEvent[]): string | null {
  const markdowns = extractPlanMarkdowns(events)
  return markdowns.length > 0 ? markdowns[markdowns.length - 1]! : null
}

function makeId(prefix: string, n: number): string {
  return `${prefix}_${String(n).padStart(3, '0')}`
}

/**
 * Build a VisualPlan from the latest `exit_plan_mode` markdown.
 *
 * @param markdown - the plan markdown.
 * @param options - session identity, latest user text, plan source seq.
 */
export function markdownToVisualPlan(
  markdown: string,
  options: { sessionId?: string; latestUserText?: string; sourceSeq?: number; revisionCount?: number } = {},
): PlanExtractResult {
  const { title, tasks: parsedTasks } = parsePlanMarkdown(markdown)
  const tasks: PlanTask[] = parsedTasks.map((t, i) => ({
    id: makeId('task', i + 1),
    title: t.title,
    description: t.description,
    type: t.type,
    status: t.status,
    dependencies: [],
    metadata: {},
  }))

  // Default chain: each task depends on the previous one (plan order).
  for (let i = 1; i < tasks.length; i += 1) {
    if (!parsedTasks[i]!.depRefs.some((ref) => ref === parsedTasks[i - 1]!.title)) {
      tasks[i]!.dependencies.push(tasks[i - 1]!.id)
    }
  }
  // Resolve explicit annotations (replace default where present).
  const withRefs = tasks.map((task, i) => {
    const refs = parsedTasks[i]!.depRefs
    return { ...task, depRefs: refs } as PlanTask & { depRefs: string[] }
  })
  resolveDependencies(withRefs)
  for (let i = 0; i < tasks.length; i += 1) {
    if (withRefs[i]!.dependencies.length > 0) tasks[i]!.dependencies = withRefs[i]!.dependencies
  }

  const sourceSeq = options.sourceSeq ?? 0
  const plan: VisualPlan = {
    id: `plan_${sourceSeq}`,
    version: 1,
    approvedVersion: null,
    executionVersion: null,
    title,
    goal: options.latestUserText ?? '',
    status: 'reviewing',
    tasks,
    edges: deriveEdges(tasks),
    comments: [],
    metadata: {
      source: 'dsh',
      sourceSeq,
      revisionCount: options.revisionCount ?? 1,
      createdAt: Date.now(),
    },
  }

  const issues: string[] = []
  const validation = validatePlan(plan, { repair: true })
  for (const issue of validation.issues) {
    if (issue.level === 'warning') issues.push(issue.message)
  }
  const repaired = validation.plan ?? plan
  return { plan: repaired, issues }
}

/** DeepSeek Harness adapter implementation. */
export const deepseekHarnessAdapter: PlanAdapter = {
  source: 'dsh',

  detect(events: readonly PlanRawEvent[]): boolean {
    return events.some(isPlanEvent)
  },

  extract(ctx: PlanAdapterContext): PlanExtractResult | null {
    const markdowns = extractPlanMarkdowns(ctx.events)
    if (markdowns.length === 0) return null
    const latest = markdowns[markdowns.length - 1]!
    const planEvents = ctx.events.filter(isPlanEvent)
    const latestEvent = planEvents
      .filter((e) => parsePlanArgs(e.argsRaw ?? '') === latest)
      .sort((a, b) => b.seq - a.seq)[0]
    return markdownToVisualPlan(latest, {
      sessionId: ctx.sessionId,
      latestUserText: ctx.latestUserText,
      sourceSeq: latestEvent?.seq,
      revisionCount: markdowns.length,
    })
  },
}

/** Registry of adapters in priority order (v1: DSH only). */
export const planAdapters: PlanAdapter[] = [deepseekHarnessAdapter]

/** Pick the first adapter that understands the available events. */
export function resolveAdapter(ctx: PlanAdapterContext): PlanAdapter | null {
  for (const adapter of planAdapters) {
    if (adapter.detect(ctx.events)) return adapter
  }
  return null
}

/**
 * Build the message that hands an approved revised plan back to DSH.
 *
 * Matches the v1 write-back contract: state the change summary, embed the
 * full revised markdown, and ask DSH to continue execution on it.
 */
export function buildRevisedPlanMessage(plan: VisualPlan, diff: PlanDiff): string {
  const summary = formatDiff(diff)
  // The version actually being executed wins: with the execution lock, a
  // later approval (v5) must never re-bind an in-flight execution (v4).
  const bound = plan.executionVersion ?? plan.approvedVersion ?? plan.version
  return [
    'The user modified the current execution plan.',
    '',
    'Please use the following revised plan.',
    '',
    `This is Plan v${bound} — the version explicitly approved by the user.`,
    '',
    'Changes:',
    summary === '' ? '- No structural changes; the plan was reviewed and confirmed.' : summary,
    '',
    'Important:',
    'The revised plan was explicitly approved by the user. Execute Plan v' + String(bound) + ' exactly.',
    '',
    'If the situation changes during execution, do not silently modify the approved plan:',
    'report the change and propose a new plan for the user to approve first.',
    '',
    '```markdown',
    serializePlanMarkdown(plan).trimEnd(),
    '```',
  ].join('\n')
}

export { serializePlanMarkdown }
