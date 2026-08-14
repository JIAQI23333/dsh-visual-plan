/**
 * `.plan/` file store (host side).
 *
 * Owns the atomic persistence of approved plans:
 *
 *   <workspace>/.plan/plan.json          latest VisualPlan
 *   <workspace>/.plan/plan.md            latest markdown
 *   <workspace>/.plan/revisions/vN.json  immutable PlanVersion snapshots
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

/**
 * Persist an approved plan: append a version snapshot and refresh plan.json +
 * plan.md. Returns the created version.
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
