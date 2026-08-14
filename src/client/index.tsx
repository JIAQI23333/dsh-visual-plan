/**
 * Browser plugin entry for dsh-visual-plan.
 *
 * Registers a "Visual Plan" tab in the conversation view ring (between Chat
 * and Trajectory). The view:
 *  1. reads the session conversation snapshot,
 *  2. extracts the DSH plan (`exit_plan_mode`) into a VisualPlan,
 *  3. renders the editable canvas,
 *  4. on Apply Changes, persists a version through the host route and hands
 *     the approved revised plan back to the agent via the composer input
 *     actions (setDraft + submit).
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import '@xyflow/react/dist/style.css'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { PlanAction, PlanEditorState } from './state.ts'
import { createEditorState, planReducer } from './state.ts'
import { extractPlan } from './extract.ts'
import { PlanCanvas } from './canvas/PlanCanvas.tsx'
import styles from './canvas/PlanCanvas.module.css'

/** Services required by the client face. */
export const inject = ['slots']

/** Conversation view tab id. */
export const VIEW_ID = 'visual-plan'

/** Full props of the visual-plan view entry (standard session kit only). */
export type PlanViewProps = PropsRuntime<'conversation.view'>

/** Client plugin body: register the Visual Plan tab. */
export function apply(ctx: ClientContext): void {
  ctx.slots.inject('conversation.view', () => ctx.slots.register({
    name: 'conversation.view',
    id: VIEW_ID,
    order: 5,
    label: () => 'Visual Plan',
  }, PlanView))
}

/** View component: extract the plan from the snapshot and render the canvas. */
function PlanView(props: PlanViewProps): JSX.Element {
  const { useSession, sessionId, inputActions } = props
  const snapshot = useSession((s) => s)

  const extracted = useMemo(() => (snapshot ? extractPlan(snapshot) : null), [snapshot])
  const [editor, setEditor] = useState<PlanEditorState | null>(null)
  const lastKey = useRef<string>('')

  const extractionKey = extracted
    ? `${extracted.plan.id}:${String(extracted.plan.metadata.sourceSeq ?? 0)}:${String(extracted.plan.metadata.revisionCount ?? 1)}`
    : ''

  // Adopt a new plan from the agent. A fresh extraction is a new base; an
  // in-progress user edit is never silently replaced (agent re-plans only
  // happen after a submit, so in practice the editor is clean here).
  useEffect(() => {
    if (extracted === null || extractionKey === lastKey.current) return
    lastKey.current = extractionKey
    setEditor((prev) => (prev !== null && !prev.dirty ? prev : createEditorState(extracted.plan)))
  }, [extractionKey, extracted])

  const dispatch = (action: PlanAction): void => {
    setEditor((prev) => (prev === null ? prev : planReducer(prev, action)))
  }

  if (editor === null) {
    return (
      <div className={styles.empty}>
        <div>还没有可视化计划</div>
        <div>
          在计划模式下让模型产出计划（例如 <code>/plan</code>），计划会以节点画布的形式出现在这里。
        </div>
        <div style={{ fontSize: 12, opacity: 0.7 }}>No plan yet — enter plan mode (/plan) and ask for a plan.</div>
      </div>
    )
  }

  return (
    <PlanCanvas
      sessionId={sessionId}
      state={editor}
      dispatch={dispatch}
      inputActions={inputActions}
    />
  )
}
