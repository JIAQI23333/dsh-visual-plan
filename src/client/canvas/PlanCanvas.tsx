/**
 * The Visual Plan page: a React Flow task graph with an editor panel.
 *
 * Toolbar (title, revision, status, Add Task, Auto layout, Discard,
 * Apply Changes) → canvas + right-hand editor. Selecting a node opens the
 * editor; connecting nodes edits dependencies; Apply Changes opens the diff
 * dialog and, once confirmed, persists a version and hands the revised plan
 * back to DSH through the composer input actions.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  applyNodeChanges,
  type Connection,
  type Edge,
  type NodeChange,
} from '@xyflow/react'
import type { PlanDiff, VisualPlan } from '../../schema/types.ts'
import { buildRevisedPlanMessage } from '../../adapter/dsh.ts'
import { diffPlans } from '../../engine/diff.ts'
import { savePlanToHost } from '../api.ts'
import { dependentsOf, type PlanAction, type PlanEditorState } from '../state.ts'
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
}

type PanelMode = 'closed' | 'edit' | 'new'

export function PlanCanvas(props: PlanCanvasProps): JSX.Element {
  const { sessionId, state, dispatch, inputActions } = props
  const plan = state.current

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [panelMode, setPanelMode] = useState<PanelMode>('closed')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [diffOpen, setDiffOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [positions, setPositions] = useState<PlanPositions>({})
  const [nodes, setNodes] = useState<PlanFlowNodeType[]>([])
  const dragPositions = useRef<PlanPositions>({})

  const titleById = useMemo(() => new Map(plan.tasks.map((t) => [t.id, t.title])), [plan.tasks])
  const idsKey = plan.tasks.map((t) => t.id).join('|')

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
        selected: task.id === selectedId,
      },
    })))
  }, [plan.tasks, positions, selectedId, titleById])

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

  const selectedTask = plan.tasks.find((t) => t.id === selectedId) ?? null
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

  const openDiff = (): void => {
    setSubmitError(null)
    setDiffOpen(true)
  }

  const confirmApply = async (): Promise<void> => {
    if (!inputActions) {
      setSubmitError('Composer is unavailable — cannot submit the revised plan.')
      return
    }
    const diff = diffPlans(state.base, state.current)
    setSubmitting(true)
    setSubmitError(null)
    try {
      await savePlanToHost(sessionId, state.current, diff, 'user')
      const message = buildRevisedPlanMessage(state.current, diff)
      inputActions.setDraft(message)
      inputActions.submit()
      dispatch({ type: 'applied' })
      setDiffOpen(false)
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : String(error))
    } finally {
      setSubmitting(false)
    }
  }

  const diff: PlanDiff = useMemo(() => diffPlans(state.base, state.current), [state.base, state.current])

  return (
    <div className={styles.root}>
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <span className={styles.title}>{plan.title}</span>
          <span className={styles.badge}>v{plan.version}</span>
          <span className={`${styles.badge} ${styles[`planStatus${plan.status}`]}`}>{plan.status}</span>
          {state.dirty && <span className={`${styles.badge} ${styles.badgeDirty}`}>edited</span>}
        </div>
        <div className={styles.toolbarRight}>
          <button type="button" className={styles.action} onClick={() => { setSelectedId(null); setPanelMode('new'); setConfirmDelete(false) }}>
            + Add Task
          </button>
          <button type="button" className={styles.action} onClick={() => setPositions(layoutPlan(plan))}>
            Auto layout
          </button>
          <button type="button" className={styles.action} disabled={!state.dirty} onClick={() => dispatch({ type: 'discard' })}>
            Discard
          </button>
          <button type="button" className={`${styles.action} ${styles.actionPrimary}`} disabled={!state.dirty} onClick={openDiff}>
            Apply Changes
          </button>
        </div>
      </div>

      {state.error && <div className={styles.errorBar}>{state.error}</div>}

      <div className={styles.body}>
        <div className={styles.canvas}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={{ plan: PlanFlowNode }}
            onNodesChange={onNodesChange}
            onConnect={onConnect}
            onEdgesDelete={onEdgesDelete}
            onNodeClick={(_, node) => openEditor(node.id)}
            onPaneClick={() => { setSelectedId(null); setPanelMode('closed') }}
            fitView
            minZoom={0.2}
            maxZoom={1.75}
            deleteKeyCode={null}
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={16} />
            <Controls />
            <MiniMap pannable zoomable />
          </ReactFlow>
        </div>

        {panelMode !== 'closed' && (
          <aside className={styles.panel}>
            {panelMode === 'new' ? (
              <TaskEditor
                key="new"
                mode="new"
                tasks={plan.tasks}
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
                  onSave={(draft) => handleSaveTask(draft, selectedTask.id)}
                  onCancel={() => { setPanelMode('closed'); setSelectedId(null) }}
                  onDelete={handleDelete}
                />
                <CommentsPanel
                  taskId={selectedTask.id}
                  comments={plan.comments.filter((c) => c.taskId === selectedTask.id)}
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
        submitting={submitting}
        error={submitError}
        onCancel={() => { if (!submitting) setDiffOpen(false) }}
        onConfirm={confirmApply}
      />
    </div>
  )
}

/** Re-exported for convenience (canvas width shared by layout). */
export { NODE_WIDTH }
