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
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { PlanAction, PlanEditorState } from './state.ts'
import { createEditorState, planReducer } from './state.ts'
import { extractPlan } from './extract.ts'
import { PlanCanvas } from './canvas/PlanCanvas.tsx'
import { visualPlanEn, visualPlanZh, type VisualPlanT } from './i18n.ts'
import styles from './canvas/PlanCanvas.module.css'

/** Services required by the client face. */
export const inject = ['slots', 'locale']

/** Conversation view tab id. */
export const VIEW_ID = 'visual-plan'

/** Full props of the visual-plan view entry (standard session kit only). */
export type PlanViewProps = PropsRuntime<'conversation.view'> & PropsLocale<'visual-plan'>

/** Client plugin body: register the Visual Plan tab. */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => {
    // Dictionary registration; the typed register enforces zh/en key balance.
    const disposeLocale = ctx.locale.register('visual-plan', { zh: visualPlanZh, en: visualPlanEn })
    const t = ctx.locale.bind('visual-plan')

    // The view entry is re-registered on locale switches: the label thunk
    // reads the live translation, and re-registering bumps the slot ledger so
    // the shell re-reads the tab label (the contract's re-render trigger).
    let disposeView: (() => void) | null = null
    const mountView = (): void => {
      disposeView?.()
      disposeView = ctx.slots.inject('conversation.view', () => ctx.slots.register({
        name: 'conversation.view',
        id: VIEW_ID,
        order: 5,
        label: () => t('tab'),
        locale: 'visual-plan',
      }, PlanView))
    }
    mountView()

    const offLocale = ctx.on('locale/change', mountView)
    return () => {
      offLocale()
      disposeView?.()
      disposeLocale()
    }
  }, 'dsh-visual-plan: view entry + locale')
}

/** View component: extract the plan from the snapshot and render the canvas. */
function PlanView(props: PlanViewProps): JSX.Element {
  const { useSession, sessionId, inputActions, t } = props
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
    // Adopt a new plan from the agent; never clobber an in-progress edit.
    setEditor((prev) => (prev !== null && prev.dirty ? prev : createEditorState(extracted.plan)))
  }, [extractionKey, extracted])

  const dispatch = (action: PlanAction): void => {
    setEditor((prev) => (prev === null ? prev : planReducer(prev, action)))
  }

  if (editor === null) {
    return (
      <div className={styles.empty}>
        <div>{t('empty.title')}</div>
        <div>{t('empty.hint')}</div>
      </div>
    )
  }

  return (
    <PlanCanvas
      sessionId={sessionId}
      state={editor}
      dispatch={dispatch}
      inputActions={inputActions}
      t={t}
    />
  )
}
