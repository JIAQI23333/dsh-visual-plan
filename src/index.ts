/**
 * Host face of dsh-visual-plan.
 *
 * Persists approved plans as versioned files inside the session's workspace
 * (see src/host/store.ts) and exposes the loopback HTTP routes the browser
 * calls. The browser never touches the filesystem directly.
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-session'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { validatePlan } from './schema/validate.ts'
import { planDir, readRevisionMetas, readStoredPlan, saveRevision } from './host/store.ts'

/** Cordis plugin name — must match package.json `name`. */
export const name = 'dsh-visual-plan'

/** Host services this plugin depends on. */
export const inject = ['webServer', 'sessions']

const API_PREFIX = '/visual-plan/api'

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(body))
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  const text = Buffer.concat(chunks).toString('utf8')
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

/** Resolve the workspace directory a session runs in, if any. */
function sessionCwd(ctx: Context, sessionId: string): string | null {
  const session = ctx.sessions.get(sessionId as SessionId)
  return session?.header.cwd ?? null
}

/** Start the plugin: register the persistence HTTP routes. */
export function apply(ctx: Context): void {
  ctx.effect(() => {
    const disposer = ctx.webServer.register({
      kind: 'prefix',
      path: API_PREFIX,
      handler: async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
        const url = new URL(req.url ?? '/', 'http://localhost')
        const path = url.pathname.replace(/\/+$/, '')

        try {
          // POST /visual-plan/api/save — persist an approved plan revision.
          if (req.method === 'POST' && path === `${API_PREFIX}/save`) {
            const body = (await readBody(req)) as {
              sessionId?: unknown
              plan?: unknown
              changes?: unknown
              author?: unknown
            } | undefined
            if (body === undefined || typeof body.sessionId !== 'string' || body.sessionId === '') {
              sendJson(res, 400, { error: 'missing-session' })
              return
            }
            const cwd = sessionCwd(ctx, body.sessionId)
            if (cwd === null) {
              sendJson(res, 404, { error: 'session-not-found' })
              return
            }
            const validation = validatePlan(body.plan, { repair: false })
            if (!validation.ok || validation.plan === null) {
              sendJson(res, 422, { error: 'invalid-plan', issues: validation.issues })
              return
            }
            const author = typeof body.author === 'string' && body.author !== '' ? body.author : 'user'
            const version = await saveRevision(cwd, validation.plan, body.changes as never, author)
            sendJson(res, 200, { ok: true, version: version.version, dir: planDir(cwd) })
            return
          }

          // GET /visual-plan/api/plans/:sessionId — read the latest stored plan.
          const plansMatch = /^\/visual-plan\/api\/plans\/([^/]+)$/.exec(path)
          if (req.method === 'GET' && plansMatch) {
            const cwd = sessionCwd(ctx, decodeURIComponent(plansMatch[1]!))
            if (cwd === null) {
              sendJson(res, 404, { error: 'session-not-found' })
              return
            }
            const plan = await readStoredPlan(cwd)
            if (plan === null) {
              sendJson(res, 404, { error: 'no-plan' })
              return
            }
            sendJson(res, 200, { plan })
            return
          }

          // GET /visual-plan/api/plans/:sessionId/revisions — list stored versions.
          const revisionsMatch = /^\/visual-plan\/api\/plans\/([^/]+)\/revisions$/.exec(path)
          if (req.method === 'GET' && revisionsMatch) {
            const cwd = sessionCwd(ctx, decodeURIComponent(revisionsMatch[1]!))
            if (cwd === null) {
              sendJson(res, 404, { error: 'session-not-found' })
              return
            }
            sendJson(res, 200, { revisions: await readRevisionMetas(cwd) })
            return
          }

          sendJson(res, 404, { error: 'not-found' })
        } catch (error) {
          ctx.logger?.warn?.('[dsh-visual-plan] route error', error)
          sendJson(res, 500, { error: 'internal' })
        }
      },
    })
    return disposer
  }, 'dsh-visual-plan: persistence routes')
}
