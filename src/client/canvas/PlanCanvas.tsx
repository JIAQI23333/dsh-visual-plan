/**
 * The Visual Plan page: a React Flow task graph with an editor panel.
 *
 * Toolbar (title, revision, status, Add Task, Auto layout, Discard,
 * Apply Changes, Map, Theme, Fullscreen) → canvas + right-hand editor.
 * Selecting a node opens the editor; connecting nodes edits dependencies;
 * Apply Changes opens the diff dialog and, once confirmed, persists a version
 * and hands the revised plan back to DSH through the composer input actions.
 *
 * Canvas preferences (map visibility, theme) persist to localStorage; theme
 * is follow-the-app by default with explicit day/night overrides.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  applyNodeChanges,
  type Connection,
  type Edge,
  type NodeChange,
  type ReactFlowInstance,
} from '@xyflow/react'
import type { PlanDiff, VisualPlan } from '../../schema/types.ts'
import { buildRevisedPlanMessage } from '../../adapter/dsh.ts'
import { diffPlans } from '../../engine/diff.ts'
import { savePlanToHost } from '../api.ts'
import { dependentsOf, type PlanAction, type PlanEditorState } from '../state.ts'
import type { VisualPlanT } from '../i18n.ts'
import { layoutPlan, NODE_WIDTH, type PlanPositions } from './layout.ts'
import { PlanFlowNode, type PlanFlowNodeType } from './PlanFlowNode.tsx'
import { TaskEditor, type TaskDraft } from '../editor/TaskEditor.tsx'
import { CommentsPanel } from '../comments/CommentsPanel.tsx'
import { DiffDialog } from '../diff/DiffDialog.tsx'
import styles from './PlanCanvas.module.css'

interface PlanCanvasProps {
  sessionId: string
  state: PlanEditorState
  dispatch: (action: PlanAction) => void
  inputActions?: { setDraft: (text: string) => void; submit: () => void } | null
  t: VisualPlanT
}

type PanelMode = 'closed' | 'edit' | 'new'
type ThemeMode = 'follow' | 'day' | 'night'

const THEME_KEY = 'dsh-visual-plan:theme'
const MINIMAP_KEY = 'dsh-visual-plan:minimap'
const INTERACTIVE_KEY = 'dsh-visual-plan:interactive'

function readPref<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw === null ? fallback : (JSON.parse(raw) as T)
  } catch {
    return fallback
  }
}

function writePref(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage unavailable (private mode etc.) — preferences stay session-local.
  }
}

export function PlanCanvas(props: PlanCanvasProps): JSX.Element {
  const { sessionId, state, dispatch, inputActions, t } = props
  const plan = state.current

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [panelMode, setPanelMode] = useState<PanelMode>('closed')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [diffOpen, setDiffOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [positions, setPositions] = useState<PlanPositions>({})
  const [nodes, setNodes] = useState<PlanFlowNodeType[]>([])
  const [theme, setTheme] = useState<ThemeMode>(() => readPref<ThemeMode>(THEME_KEY, 'follow'))
  const [showMinimap, setShowMinimap] = useState<boolean>(() => readPref<boolean>(MINIMAP_KEY, true))
  const [interactive, setInteractive] = useState<boolean>(() => readPref<boolean>(INTERACTIVE_KEY, true))
  const [fullscreen, setFullscreen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const dragPositions = useRef<PlanPositions>({})
  const rfRef = useRef<ReactFlowInstance<PlanFlowNodeType, Edge> | null>(null)

  useEffect(() => writePref(THEME_KEY, theme), [theme])
  useEffect(() => writePref(MINIMAP_KEY, showMinimap), [showMinimap])
  useEffect(() => writePref(INTERACTIVE_KEY, interactive), [interactive])

  const titleById = useMemo(() => new Map(plan.tasks.map((task) => [task.id, task.title])), [plan.tasks])
  const idsKey = plan.tasks.map((task) => task.id).join('|')

  // (Re)layout on structural change and on the manual Auto layout action.
  useEffect(() => {
    setPositions(layoutPlan(plan))
  }, [idsKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // Rebuild React Flow nodes from tasks + positions + selection.
  useEffect(() => {
    setNodes(plan.tasks.map((task) => ({
      id: task.id,
      type: 'plan',
      position: positions[task.id] ?? dragPositions.current[task.id] ?? { x: 24, y: 24 },
      data: {
        task,
        titleById,
        t,
        selected: task.id === selectedId,
      },
    })))
  }, [plan.tasks, positions, selectedId, titleById, t])

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((current) => {
      const next = applyNodeChanges(changes, current) as PlanFlowNodeType[]
      for (const change of changes) {
        if (change.type === 'position' && change.position) {
          dragPositions.current[change.id] = change.position
        }
      }
      return next
    })
  }, [])

  const edges: Edge[] = useMemo(
    () => plan.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: 'default',
    })),
    [plan.edges],
  )

  const onConnect = useCallback((connection: Connection) => {
    if (!connection.source || !connection.target) return
    dispatch({ type: 'addDependency', taskId: connection.target, dependencyId: connection.source })
  }, [dispatch])

  const onEdgesDelete = useCallback((deleted: Edge[]) => {
    for (const edge of deleted) {
      if (!edge.source || !edge.target) continue
      dispatch({ type: 'removeDependency', taskId: edge.target, dependencyId: edge.source })
    }
  }, [dispatch])

  const selectedTask = plan.tasks.find((task) => task.id === selectedId) ?? null
  const dependents = selectedId ? dependentsOf(plan, selectedId) : []

  const openEditor = (taskId: string): void => {
    setSelectedId(taskId)
    setPanelMode('edit')
    setConfirmDelete(false)
  }

  const handleSaveTask = (draft: TaskDraft, existingId?: string): void => {
    if (existingId) {
      dispatch({
        type: 'editTask',
        taskId: existingId,
        patch: {
          title: draft.title,
          description: draft.description,
          type: draft.type,
          status: draft.status,
          dependencies: draft.dependencies,
        },
      })
    } else {
      dispatch({ type: 'addTask', task: { title: draft.title, description: draft.description, type: draft.type, status: draft.status, dependencies: draft.dependencies, metadata: {} } })
    }
    setPanelMode('closed')
    setSelectedId(null)
  }

  const handleDelete = (): void => {
    if (!selectedId) return
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }
    dispatch({ type: 'deleteTask', taskId: selectedId })
    setPanelMode('closed')
    setSelectedId(null)
    setConfirmDelete(false)
  }

  // Keyboard shortcuts (v0.1.1). Ignored while typing in inputs; never
  // steals browser-native undo/redo or save.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
      const mod = event.metaKey || event.ctrlKey
      if (mod && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        dispatch({ type: event.shiftKey ? 'redo' : 'undo' })
        return
      }
      if (mod && event.key.toLowerCase() === 's') {
        event.preventDefault()
        if (state.dirty) setDiffOpen(true)
        return
      }
      if (event.key === 'Escape') {
        setMenuOpen(false)
        return
      }
      if (!mod && (event.key === 'Delete' || event.key === 'Backspace')) {
        if (selectedId !== null) {
          event.preventDefault()
          handleDelete()
        }
        return
      }
      if (!mod && event.key.toLowerCase() === 'f') {
        event.preventDefault()
        rfRef.current?.fitView({ padding: 0.2 })
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selectedId, state.dirty, dispatch, handleDelete])

  const confirmApply = async (): Promise<void> => {
    const diff = diffPlans(state.base, state.current)
    setSubmitting(true)
    setSubmitError(null)
    try {
      const nextVersion = state.base.version + 1
      // Execution Version Lock: while a version is executing, an approval
      // only bumps approvedVersion; the in-flight execution keeps its bound.
      const locked = state.base.executionVersion !== null
      const approved: VisualPlan = {
        ...state.current,
        version: nextVersion,
        status: 'executing',
        approvedVersion: nextVersion,
        executionVersion: state.base.executionVersion ?? nextVersion,
      }
      await savePlanToHost(sessionId, approved, diff, 'user')
      if (!locked) {
        if (!inputActions) {
          setSubmitError(t('diff.submitting'))
          setSubmitting(false)
          return
        }
        const message = buildRevisedPlanMessage(approved, diff)
        inputActions.setDraft(message)
        inputActions.submit()
      }
      dispatch({ type: 'applied' })
      setDiffOpen(false)
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : String(error))
    } finally {
      setSubmitting(false)
    }
  }

  const diff: PlanDiff = useMemo(() => diffPlans(state.base, state.current), [state.base, state.current])

  const canvas = (
    <div className={styles.root} data-theme={theme === 'follow' ? undefined : theme}>
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <span className={styles.title}>{plan.title}</span>
          <span className={styles.badge}>v{plan.version}</span>
          {plan.approvedVersion != null && (
            <span className={`${styles.badge} ${styles.badgeApproved}`}>
              {t('toolbar.approved')} v{plan.approvedVersion}
            </span>
          )}
          {plan.executionVersion != null && plan.executionVersion !== plan.approvedVersion && (
            <span className={`${styles.badge} ${styles.badgeExecuting}`}>
              {t('planStatus.executing')} v{plan.executionVersion}
            </span>
          )}
          <span className={`${styles.badge} ${styles[`planStatus${plan.status}`]}`}>{t(`planStatus.${plan.status}`)}</span>
          {state.dirty && <span className={`${styles.badge} ${styles.badgeDirty}`}>{t('toolbar.edited')}</span>}
        </div>
        <div className={styles.toolbarRight}>
          <button type="button" className={styles.action} onClick={() => { setSelectedId(null); setPanelMode('new'); setConfirmDelete(false) }}>
            + {t('toolbar.addTask')}
          </button>
          <button type="button" className={styles.action} disabled={state.past.length === 0} title={t('toolbar.undoHint')} onClick={() => dispatch({ type: 'undo' })}>
            {t('toolbar.undo')}
          </button>
          <button type="button" className={styles.action} disabled={state.future.length === 0} title={t('toolbar.redoHint')} onClick={() => dispatch({ type: 'redo' })}>
            {t('toolbar.redo')}
          </button>
          <button type="button" className={styles.action} disabled={!state.dirty} onClick={() => dispatch({ type: 'discard' })}>
            {t('toolbar.discard')}
          </button>
          <button type="button" className={`${styles.action} ${styles.actionPrimary}`} disabled={!state.dirty} onClick={() => setDiffOpen(true)}>
            {t('toolbar.apply')}
          </button>
          <div className={styles.moreWrap}>
            <button
              type="button"
              className={`${styles.action} ${menuOpen ? styles.actionActive : ''}`}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
            >
              {t('toolbar.more')}
            </button>
            {menuOpen && (
              <>
                <button
                  type="button"
                  className={styles.menuBackdrop}
                  tabIndex={-1}
                  aria-label={t('diff.cancel')}
                  onClick={() => setMenuOpen(false)}
                />
                <div className={styles.moreMenu} role="menu">
                  <div className={styles.moreGroup} role="group" aria-label={t('group.view')}>
                    <div className={styles.moreGroupTitle}>{t('group.view')}</div>
                    <button
                      type="button"
                      role="menuitem"
                      className={styles.moreItem}
                      onClick={() => { setPositions(layoutPlan(plan)); setMenuOpen(false) }}
                    >
                      {t('toolbar.autoLayout')}
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className={styles.moreItem}
                      onClick={() => { rfRef.current?.fitView({ padding: 0.2 }); setMenuOpen(false) }}
                    >
                      {t('toolbar.fitView')}
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className={`${styles.moreItem} ${showMinimap ? styles.moreItemActive : ''}`}
                      aria-pressed={showMinimap}
                      onClick={() => { setShowMinimap((v) => !v); setMenuOpen(false) }}
                    >
                      {t('toolbar.map')}
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className={`${styles.moreItem} ${interactive ? styles.moreItemActive : ''}`}
                      aria-pressed={interactive}
                      onClick={() => { setInteractive((v) => !v); setMenuOpen(false) }}
                    >
                      {t('toolbar.interactive')}
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className={`${styles.moreItem} ${fullscreen ? styles.moreItemActive : ''}`}
                      aria-pressed={fullscreen}
                      onClick={() => { setFullscreen((v) => !v); setMenuOpen(false) }}
                    >
                      {fullscreen ? t('toolbar.exitFullscreen') : t('toolbar.fullscreen')}
                    </button>
                  </div>
                  <div className={styles.moreGroup} role="group" aria-label={t('group.appearance')}>
                    <div className={styles.moreGroupTitle}>{t('group.appearance')}</div>
                    <label className={styles.moreThemeRow}>
                      <span>{t('toolbar.theme')}</span>
                      <select
                        className={styles.select}
                        value={theme}
                        aria-label={t('toolbar.theme')}
                        onChange={(e) => { setTheme(e.target.value as ThemeMode); setMenuOpen(false) }}
                      >
                        <option value="follow">{t('toolbar.themeFollow')}</option>
                        <option value="day">{t('toolbar.themeDay')}</option>
                        <option value="night">{t('toolbar.themeNight')}</option>
                      </select>
                    </label>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {state.error && (
        <div className={styles.errorBar}>
          {t(`error.${state.error.code}`, state.error.params)}
        </div>
      )}

      <div className={styles.body}>
        <div className={styles.canvas}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={{ plan: PlanFlowNode }}
            onInit={(instance) => { rfRef.current = instance }}
            onNodesChange={onNodesChange}
            onConnect={onConnect}
            onEdgesDelete={onEdgesDelete}
            onNodeClick={(_, node) => openEditor(node.id)}
            onPaneClick={() => { setSelectedId(null); setPanelMode('closed') }}
            elementsSelectable={interactive}
            nodesDraggable={interactive}
            nodesConnectable={interactive}
            fitView
            minZoom={0.2}
            maxZoom={1.75}
            deleteKeyCode={null}
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={16} color="var(--vp-grid)" />
            <Controls showInteractive={false} />
            {showMinimap && (
              <MiniMap
                pannable
                zoomable
                bgColor="var(--vp-minimap-bg)"
                nodeColor="var(--vp-minimap-node)"
                nodeStrokeColor="var(--vp-minimap-stroke)"
                maskColor="var(--vp-minimap-mask)"
              />
            )}
          </ReactFlow>
        </div>

        {panelMode !== 'closed' && (
          <aside className={styles.panel}>
            {panelMode === 'new' ? (
              <TaskEditor
                key="new"
                mode="new"
                tasks={plan.tasks}
                t={t}
                onSave={(draft) => handleSaveTask(draft)}
                onCancel={() => { setPanelMode('closed'); setSelectedId(null) }}
              />
            ) : selectedTask ? (
              <>
                <TaskEditor
                  key={selectedTask.id}
                  mode="edit"
                  task={selectedTask}
                  tasks={plan.tasks}
                  confirmDelete={confirmDelete}
                  dependents={dependents}
                  t={t}
                  onSave={(draft) => handleSaveTask(draft, selectedTask.id)}
                  onCancel={() => { setPanelMode('closed'); setSelectedId(null) }}
                  onDelete={handleDelete}
                />
                <CommentsPanel
                  taskId={selectedTask.id}
                  comments={plan.comments.filter((c) => c.taskId === selectedTask.id)}
                  t={t}
                  onAdd={(content) => dispatch({ type: 'addComment', taskId: selectedTask.id, content, author: 'user' })}
                  onRemove={(commentId) => dispatch({ type: 'removeComment', commentId })}
                />
              </>
            ) : null}
          </aside>
        )}
      </div>

      <DiffDialog
        open={diffOpen}
        diff={diff}
        titleById={titleById}
        t={t}
        submitting={submitting}
        error={submitError}
        note={state.base.executionVersion !== null
          ? t('diff.lockedNote', { executing: String(state.base.executionVersion), next: String(state.base.version + 1) })
          : null}
        onCancel={() => { if (!submitting) setDiffOpen(false) }}
        onConfirm={confirmApply}
      />
    </div>
  )

  // Fullscreen mode fills the whole DSH web window (body portal + fixed
  // overlay), independent of the conversation column layout.
  return fullscreen
    ? createPortal(<div className={styles.fullscreen}>{canvas}</div>, document.body)
    : canvas
}

/** Re-exported for convenience (canvas width shared by layout). */
export { NODE_WIDTH }
