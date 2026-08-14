/**
 * Source-agnostic adapter seam.
 *
 * The renderer and diff engines consume only VisualPlan; each agent/harness
 * gets one adapter that maps its raw output into that IR and back. V1 ships
 * only the DeepSeek Harness adapter — Claude/Codex/Gemini adapters slot in
 * behind this same interface later without touching the UI.
 */

import type { VisualPlan } from '../schema/types.ts'

/** The harness a plan came from. */
export type PlanSourceId = 'dsh' | string

/** Minimal structural view of a conversation event an adapter inspects. */
export interface PlanRawEvent {
  kind: string
  /** Ascending log order (newer = larger). */
  seq: number
  /** Tool name for tool-call shaped events. */
  toolName?: string
  /** Raw argument string for tool-call shaped events (usually JSON). */
  argsRaw?: string
  /** Text payload for message-shaped events. */
  text?: string
  /** Wall-clock ms when available. */
  time?: number
}

/** Context handed to adapters. */
export interface PlanAdapterContext {
  sessionId?: string
  events: readonly PlanRawEvent[]
  /** Latest user message text, if any (the plan goal source). */
  latestUserText?: string
}

/** Outcome of mapping a source's events into a VisualPlan. */
export interface PlanExtractResult {
  plan: VisualPlan
  /** Non-fatal issues surfaced to the UI (e.g. repaired references). */
  issues: string[]
}

/**
 * One adapter per agent source.
 */
export interface PlanAdapter {
  readonly source: PlanSourceId
  /** True when this adapter understands any of the given events. */
  detect(events: readonly PlanRawEvent[]): boolean
  /** Build the VisualPlan from the source's events; null when no plan exists. */
  extract(ctx: PlanAdapterContext): PlanExtractResult | null
}
