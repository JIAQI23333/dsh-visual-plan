/**
 * Conversation snapshot → VisualPlan extraction (browser side).
 *
 * Folds the session snapshot's tool-result nodes and running calls into the
 * adapter event shape, then asks the DSH adapter to build the plan. Kept
 * separate from the canvas so the pure adapter logic stays unit-testable.
 */

import type { ConversationSnapshot } from '@deepseek-ai/dsh-client-runtime/client'
import { resolveAdapter } from '../adapter/dsh.ts'
import type { PlanExtractResult, PlanRawEvent } from '../adapter/types.ts'

/** Fold a snapshot into adapter input events. */
export function snapshotToEvents(snapshot: ConversationSnapshot): PlanRawEvent[] {
  const events: PlanRawEvent[] = []
  for (const node of snapshot.nodes) {
    if (node.kind === 'tool-result' && node.call) {
      events.push({
        kind: 'tool-result',
        seq: node.seq,
        toolName: node.call.name,
        argsRaw: node.call.argsRaw,
        time: node.time,
      })
    } else if (node.kind === 'user') {
      const content = (node as { content?: unknown }).content
      const text = Array.isArray(content)
        ? content
            .map((block) => {
              if (block && typeof block === 'object' && 'text' in block && typeof (block as { text: unknown }).text === 'string') {
                return (block as { text: string }).text
              }
              return ''
            })
            .filter(Boolean)
            .join('\n')
        : undefined
      events.push({ kind: 'user', seq: node.seq, text, time: node.time })
    }
  }
  for (const call of snapshot.runningCalls) {
    events.push({
      kind: 'tool-call',
      seq: call.time,
      toolName: call.name,
      argsRaw: call.argsRaw,
      time: call.time,
    })
  }
  return events
}

/** Latest non-empty user text (the plan goal source). */
export function latestUserText(events: readonly PlanRawEvent[]): string | undefined {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const text = events[i]!.text
    if (events[i]!.kind === 'user' && text && text.trim() !== '') return text
  }
  return undefined
}

/** Extract a VisualPlan from a conversation snapshot; null when no plan. */
export function extractPlan(snapshot: ConversationSnapshot): PlanExtractResult | null {
  const events = snapshotToEvents(snapshot)
  const adapter = resolveAdapter({ sessionId: snapshot.sessionId, events, latestUserText: latestUserText(events) })
  if (!adapter) return null
  return adapter.extract({ sessionId: snapshot.sessionId, events, latestUserText: latestUserText(events) })
}
