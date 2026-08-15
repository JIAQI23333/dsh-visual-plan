/**
 * `.plan/` file store (host side).
 *
 * Owns the atomic persistence of approved plans:
 *
 *   <workspace>/.plan/plan.json          latest VisualPlan
 *   <workspace>/.plan/plan.md            latest markdown
 *   <workspace>/.plan/revisions/vN.json  immutable PlanVersion snapshots
 *   <workspace>/.plan/execution.json     write-once execution snapshot
 */

import { mkdir, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { validatePlan } from '../schema/validate.ts'
import { serializePlanMarkdown } from '../engine/markdown.ts'
import { createPlanVersion } from '../engine/revision.ts'
import type { PlanDiff, PlanVersion, PlanVersionMeta, VisualPlan } from '../schema/types.ts'

/** Atomic write: same-directory temp file + rename. */
export async function atomicWrite(path: string, content: string): Promise<void> {
  const tmp = `${path}.tmp-${process.pid}-${Date.now()}`
  await writeFile(tmp, content, 'utf8')
  try {
    await rename(tmp, path)
  } catch (error) {
    await unlink(tmp).catch(() => undefined)
    throw error
  }
}

export function planDir(cwd: string): string {
  return join(cwd, '.plan')
}

export function revisionsDir(cwd: string): string {
  return join(planDir(cwd), 'revisions')
}

/** Write-once execution snapshot bound to an approved revision. */
export interface ExecutionRecord {
  planId: string
  executionVersion: number
  /** Relative path (from `.plan/`) of the immutable revision being executed. */
  revision: string
  startedAt: number
  status: 'running' | 'completed' | 'failed'
}

export function executionFile(cwd: string): string {
  return join(planDir(cwd), 'execution.json')
}

/**
 * Persist the execution snapshot for a plan. Write-once per execution
 * version: once a version's record exists, it is never overwritten, so a
 * later approval/draft cannot mutate the snapshot of an in-flight execution.
 */
export async function saveExecution(cwd: string, plan: VisualPlan): Promise<ExecutionRecord> {
  if (plan.executionVersion === null) throw new Error('executionVersion is not set')
  const record: ExecutionRecord = {
    planId: plan.id,
    executionVersion: plan.executionVersion,
    revision: `revisions/v${plan.executionVersion}.json`,
    startedAt: Date.now(),
    status: 'running',
  }
  const file = executionFile(cwd)
  try {
    const existing = JSON.parse(await readFile(file, 'utf8')) as ExecutionRecord
    if (existing.executionVersion === record.executionVersion) return existing
  } catch {
    // No snapshot yet — write it.
  }
  await atomicWrite(file, JSON.stringify(record, null, 2))
  return record
}

/** Read the current execution snapshot (null when none exists). */
export async function readExecution(cwd: string): Promise<ExecutionRecord | null> {
  try {
    const parsed = JSON.parse(await readFile(executionFile(cwd), 'utf8')) as ExecutionRecord
    if (typeof parsed.executionVersion !== 'number' || typeof parsed.revision !== 'string') return null
    return parsed
  } catch {
    return null
  }
}

/**
 * Persist an approved plan: append a version snapshot and refresh plan.json +
 * plan.md; when the plan carries an execution version, also persist the
 * write-once execution snapshot. Returns the created version.
 */
export async function saveRevision(
  cwd: string,
  plan: VisualPlan,
  changes: PlanDiff,
  author: string,
): Promise<PlanVersion> {
  const revDir = revisionsDir(cwd)
  await mkdir(revDir, { recursive: true })

  const previous = await readStoredPlan(cwd)
  const version = createPlanVersion(previous, plan, author, changes)
  await atomicWrite(join(revDir, `v${version.version}.json`), JSON.stringify(version, null, 2))
  await atomicWrite(join(planDir(cwd), 'plan.json'), JSON.stringify(plan, null, 2))
  await atomicWrite(join(planDir(cwd), 'plan.md'), serializePlanMarkdown(plan))
  if (plan.executionVersion !== null) await saveExecution(cwd, plan)
  return version
}

/** Read the latest stored plan for a workspace (null when absent/corrupt). */
export async function readStoredPlan(cwd: string): Promise<VisualPlan | null> {
  try {
    const text = await readFile(join(planDir(cwd), 'plan.json'), 'utf8')
    const parsed: unknown = JSON.parse(text)
    const result = validatePlan(parsed, { repair: false })
    return result.ok ? result.plan : null
  } catch {
    return null
  }
}

/** List stored revision metadata, oldest first. */
export async function readRevisionMetas(cwd: string): Promise<PlanVersionMeta[]> {
  try {
    const files = (await readdir(revisionsDir(cwd))).filter((f) => /^v\d+\.json$/.test(f))
    files.sort((a, b) => Number(a.slice(1, -5)) - Number(b.slice(1, -5)))
    const metas: PlanVersionMeta[] = []
    for (const file of files) {
      try {
        const parsed = JSON.parse(await readFile(join(revisionsDir(cwd), file), 'utf8')) as {
          version?: number
          timestamp?: number
          author?: string
          changes?: PlanVersionMeta['changes']
          plan?: { title?: string }
        }
        metas.push({
          version: parsed.version ?? 0,
          timestamp: parsed.timestamp ?? 0,
          author: parsed.author ?? 'unknown',
          changes: parsed.changes ?? { added: [], removed: [], modified: [], dependencyChanges: [], commentChanges: [] },
          title: parsed.plan?.title ?? '',
        })
      } catch {
        // Skip torn/partial revision files; they are never the source of truth.
      }
    }
    return metas
  } catch {
    return []
  }
}
