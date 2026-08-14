/**
 * Right-hand task editor: title, description, type, status, dependencies,
 * plus save / cancel / delete. The same form serves both editing an existing
 * task and creating a new one.
 */

import { useState } from 'react'
import { TASK_STATUSES, TASK_TYPES, type PlanTask, type TaskStatus, type TaskType } from '../../schema/types.ts'
import styles from './TaskEditor.module.css'

export interface TaskDraft {
  title: string
  description: string
  type: TaskType
  status: TaskStatus
  dependencies: string[]
}

interface TaskEditorProps {
  mode: 'edit' | 'new'
  task?: PlanTask
  tasks: readonly PlanTask[]
  confirmDelete?: boolean
  dependents?: readonly PlanTask[]
  onSave: (draft: TaskDraft) => void
  onCancel: () => void
  onDelete?: () => void
}

function emptyDraft(): TaskDraft {
  return { title: '', description: '', type: 'other', status: 'pending', dependencies: [] }
}

export function TaskEditor(props: TaskEditorProps): JSX.Element {
  const { mode, task, tasks, confirmDelete = false, dependents = [], onSave, onCancel, onDelete } = props
  const [draft, setDraft] = useState<TaskDraft>(() => (
    task
      ? { title: task.title, description: task.description, type: task.type, status: task.status, dependencies: [...task.dependencies] }
      : emptyDraft()
  ))

  const others = tasks.filter((t) => t.id !== task?.id)
  const valid = draft.title.trim() !== ''

  const toggleDependency = (id: string): void => {
    setDraft((d) => ({
      ...d,
      dependencies: d.dependencies.includes(id)
        ? d.dependencies.filter((x) => x !== id)
        : [...d.dependencies, id],
    }))
  }

  return (
    <div className={styles.editor}>
      <div className={styles.heading}>{mode === 'new' ? 'New Task' : 'Task Editor'}</div>

      <label className={styles.field}>
        <span className={styles.label}>Title</span>
        <input
          className={styles.input}
          value={draft.title}
          placeholder="Task title"
          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
        />
      </label>

      <label className={styles.field}>
        <span className={styles.label}>Description</span>
        <textarea
          className={`${styles.input} ${styles.textarea}`}
          value={draft.description}
          rows={4}
          placeholder="What does this task involve?"
          onChange={(e) => setDraft({ ...draft, description: e.target.value })}
        />
      </label>

      <div className={styles.fieldRow}>
        <label className={styles.field}>
          <span className={styles.label}>Type</span>
          <select
            className={styles.input}
            value={draft.type}
            onChange={(e) => setDraft({ ...draft, type: e.target.value as TaskType })}
          >
            {TASK_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <label className={styles.field}>
          <span className={styles.label}>Status</span>
          <select
            className={styles.input}
            value={draft.status}
            onChange={(e) => setDraft({ ...draft, status: e.target.value as TaskStatus })}
          >
            {TASK_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
      </div>

      <div className={styles.field}>
        <span className={styles.label}>Dependencies</span>
        <div className={styles.deps}>
          {others.length === 0 && <div className={styles.depsEmpty}>No other tasks.</div>}
          {others.map((other) => (
            <label key={other.id} className={styles.depRow}>
              <input
                type="checkbox"
                checked={draft.dependencies.includes(other.id)}
                onChange={() => toggleDependency(other.id)}
              />
              <span className={styles.depTitle}>{other.title}</span>
            </label>
          ))}
        </div>
      </div>

      <div className={styles.actions}>
        <button type="button" className={styles.button} onClick={onCancel}>Cancel</button>
        <button
          type="button"
          className={`${styles.button} ${styles.primary}`}
          disabled={!valid}
          onClick={() => onSave(draft)}
        >
          Save
        </button>
      </div>

      {mode === 'edit' && onDelete && (
        <div className={styles.deleteZone}>
          {confirmDelete ? (
            <>
              <div className={styles.deleteWarn}>
                {dependents.length > 0
                  ? `This task is required by ${dependents.length} other task${dependents.length === 1 ? '' : 's'}: ${dependents.map((d) => d.title).join(', ')}. Delete anyway?`
                  : 'Delete this task? This cannot be undone.'}
              </div>
              <div className={styles.actions}>
                <button type="button" className={styles.button} onClick={onCancel}>Cancel</button>
                <button type="button" className={`${styles.button} ${styles.danger}`} onClick={onDelete}>
                  Delete
                </button>
              </div>
            </>
          ) : (
            <button type="button" className={`${styles.button} ${styles.dangerGhost}`} onClick={onDelete}>
              Delete
            </button>
          )}
        </div>
      )}
    </div>
  )
}
