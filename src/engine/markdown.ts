/**
 * Markdown ⇄ VisualPlan conversion.
 *
 * DSH's plan mode delivers plans as markdown (the `plan` argument of the
 * `exit_plan_mode` tool). This module parses that markdown into the flat task
 * graph and serializes an edited graph back to markdown for the agent.
 *
 * Parsing rules (v1):
 * - the first `#` heading is the plan title;
 * - every `##`+ heading and every `-` list item becomes one task;
 * - prose directly after a heading/item becomes that task's description;
 * - `- [x]` marks a task completed;
 * - `depends on:` / `依赖:` / `前置:` annotations create explicit edges;
 * - without explicit annotations, tasks form a default sequential chain
 *   (matching DSH's natural plan order); the user can rewire edges later.
 */

import { TASK_TYPES, type PlanTask, type TaskStatus, type TaskType, type VisualPlan } from '../schema/types.ts'

export interface ParsedTask {
  title: string
  description: string
  type: TaskType
  status: TaskStatus
  /** Dependency references (titles or ids) resolved after the full parse. */
  depRefs: string[]
}

export interface PlanParseResult {
  title: string
  tasks: ParsedTask[]
}

/** Strip common inline markdown for display text. */
function stripInline(text: string): string {
  return text
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
    .trim()
}

const TYPE_KEYWORDS: ReadonlyArray<{ type: TaskType; words: readonly string[] }> = [
  {
    type: 'analysis',
    words: ['分析', '调研', '调查', '评估', '审查', '梳理', '盘点', 'research', 'analy', 'assess', 'survey', 'audit', 'review'],
  },
  {
    type: 'design',
    words: ['设计', '架构', '方案', '建模', '原型', 'design', 'architecture', 'schema', 'blueprint'],
  },
  {
    type: 'testing',
    words: ['测试', '验证', '质检', '回归', '用例', 'test', 'verify', 'validat', 'qa'],
  },
  {
    type: 'refactor',
    words: ['重构', '优化', '清理', '整理', '迁移', '升级', 'refactor', 'optimiz', 'cleanup', 'migrat'],
  },
  {
    type: 'coding',
    words: ['实现', '开发', '编写', '创建', '添加', '增加', '接入', '集成', '构建', '搭建', '写', '后端', '前端', '接口', 'api', 'implement', 'code', 'build', 'add', 'create', 'develop', 'integrat', 'configure', 'setup'],
  },
]

/** Infer a task type from its text (English and Chinese keywords). */
export function inferTaskType(text: string): TaskType {
  const lower = text.toLowerCase()
  for (const group of TYPE_KEYWORDS) {
    if (group.words.some((w) => lower.includes(w))) return group.type
  }
  return 'other'
}

interface HeadingState {
  level: number
  taskIndex: number
}

/** Parse a DSH plan markdown into a title + ordered task list. */
export function parsePlanMarkdown(markdown: string): PlanParseResult {
  const lines = markdown.split(/\r?\n/)
  let title = 'Untitled plan'
  const tasks: ParsedTask[] = []
  const headingStack: HeadingState[] = []
  let current: ParsedTask | null = null

  const makeTask = (raw: string, done: boolean): ParsedTask => {
    let cleaned = stripInline(raw)
    const depRefs: string[] = []
    // Explicit dependency annotations: "depends on:", "depends-on:",
    // "依赖:", "前置:" — parsed before inference so they never leak into
    // the visible title or the type guess.
    const annotation = /(?:depends(?:\s*-?\s*on)?|依赖|前置)\s*[:：]\s*([^\n]+)/i.exec(cleaned)
    if (annotation) {
      for (const ref of annotation[1]!.split(/[,，、]/)) {
        const clean = ref.replace(/^[（(]+|[）)]+$/g, '').replace(/^`+|`+$/g, '').trim()
        if (clean !== '') depRefs.push(clean)
      }
      cleaned = cleaned
        .replace(/[（(]?(?:depends(?:\s*-?\s*on)?|依赖|前置)\s*[:：][^）)\n]*[）)]?/i, '')
        .trim()
    }
    const task: ParsedTask = {
      title: cleaned,
      description: '',
      type: inferTaskType(cleaned),
      status: done ? 'completed' : 'pending',
      depRefs,
    }
    tasks.push(task)
    return task
  }

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed === '') continue

    const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed)
    if (heading) {
      const level = heading[1]!.length
      const text = stripInline(heading[2]!)
      if (level === 1) {
        title = text
        headingStack.length = 0
        continue
      }
      while (headingStack.length > 0 && headingStack[headingStack.length - 1]!.level >= level) {
        headingStack.pop()
      }
      const parentIndex = headingStack.length > 0 ? headingStack[headingStack.length - 1]!.taskIndex : -1
      current = makeTask(text, false)
      const index = tasks.length - 1
      if (parentIndex >= 0) tasks[index]!.depRefs.push(tasks[parentIndex]!.title)
      headingStack.push({ level, taskIndex: index })
      continue
    }

    const checkbox = /^[-*]\s*\[([ xX])\]\s*(.*)$/.exec(trimmed)
    if (checkbox || /^[-*]\s+/.test(trimmed)) {
      const done = checkbox ? checkbox[1]!.toLowerCase() === 'x' : false
      const text = checkbox ? checkbox[2]! : trimmed.replace(/^[-*]\s+/, '')
      current = makeTask(text, done)
      continue
    }

    // Prose: attach to the most recent task as its description.
    if (current) {
      current.description = current.description === ''
        ? stripInline(trimmed)
        : `${current.description}\n${stripInline(trimmed)}`
    }
  }

  return { title, tasks }
}

/** Resolve depRefs to task ids by exact title or id match. */
export function resolveDependencies(tasks: Array<PlanTask & { depRefs?: string[] }>): void {
  const byTitle = new Map<string, string>()
  for (const task of tasks) {
    byTitle.set(task.title.toLowerCase(), task.id)
    byTitle.set(task.id, task.id)
  }
  for (const task of tasks) {
    const refs = task.depRefs ?? []
    const deps: string[] = []
    for (const ref of refs) {
      const hit = byTitle.get(ref.toLowerCase()) ?? byTitle.get(ref)
      if (hit && hit !== task.id && !deps.includes(hit)) deps.push(hit)
    }
    if (deps.length > 0) task.dependencies = deps
    delete task.depRefs
  }
}

/** Derive the edges array from task dependencies (single source of truth). */
export function deriveEdges(tasks: readonly PlanTask[]): VisualPlan['edges'] {
  const edges: VisualPlan['edges'] = []
  const seen = new Set<string>()
  for (const task of tasks) {
    for (const dep of task.dependencies) {
      const key = `${dep}->${task.id}`
      if (seen.has(key)) continue
      seen.add(key)
      edges.push({ id: key, source: dep, target: task.id })
    }
  }
  return edges
}

/** Serialize a VisualPlan back to markdown for the agent to consume. */
export function serializePlanMarkdown(plan: VisualPlan): string {
  const byId = new Map(plan.tasks.map((t) => [t.id, t]))
  const lines: string[] = [`# ${plan.title}`]
  if (plan.goal.trim() !== '') lines.push('', plan.goal.trim())

  for (const task of plan.tasks) {
    lines.push('')
    const box = task.status === 'completed' ? '[x]' : '[ ]'
    let line = `- ${box} ${task.title}`
    if (task.dependencies.length > 0) {
      const names = task.dependencies
        .map((id) => byId.get(id)?.title ?? id)
        .join(', ')
      line += ` (depends on: ${names})`
    }
    lines.push(line)
    if (task.description.trim() !== '') {
      for (const descLine of task.description.split('\n')) {
        lines.push(`  ${descLine.trim()}`)
      }
    }
  }
  return `${lines.join('\n')}\n`
}

/** True when the markdown contains a plan-like heading (guard for adapters). */
export function looksLikePlan(markdown: string): boolean {
  return /^\s*#\s+\S+/m.test(markdown) || /^\s*[-*]\s+/.test(markdown)
}

export { TASK_TYPES }
