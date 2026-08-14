/**
 * Browser → host persistence bridge.
 *
 * The browser never writes the filesystem; approved plans are POSTed to the
 * host route registered by the host face, which persists `.plan/` files.
 */

import type { PlanDiff, PlanVersionMeta, VisualPlan } from '../schema/types.ts'

const API_BASE = '/visual-plan/api'

interface SaveResponse {
  ok: boolean
  version?: number
  dir?: string
  error?: string
}

/** Persist an approved plan revision on the host. */
export async function savePlanToHost(
  sessionId: string,
  plan: VisualPlan,
  changes: PlanDiff,
  author: string,
): Promise<{ version: number; dir: string }> {
  const response = await fetch(`${API_BASE}/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, plan, changes, author }),
  })
  const body = (await response.json()) as SaveResponse
  if (!response.ok || !body.ok || body.version === undefined) {
    throw new Error(body.error ?? `save failed (${response.status})`)
  }
  return { version: body.version, dir: body.dir ?? '' }
}

/** Read the latest stored plan for a session, if any. */
export async function fetchStoredPlan(sessionId: string): Promise<VisualPlan | null> {
  const response = await fetch(`${API_BASE}/plans/${encodeURIComponent(sessionId)}`, { headers: { Accept: 'application/json' } })
  if (!response.ok) return null
  const body = (await response.json()) as { plan?: VisualPlan }
  return body.plan ?? null
}

/** List stored revision metadata (oldest first). */
export async function fetchRevisions(sessionId: string): Promise<PlanVersionMeta[]> {
  const response = await fetch(`${API_BASE}/plans/${encodeURIComponent(sessionId)}/revisions`, { headers: { Accept: 'application/json' } })
  if (!response.ok) return []
  const body = (await response.json()) as { revisions?: PlanVersionMeta[] }
  return body.revisions ?? []
}
