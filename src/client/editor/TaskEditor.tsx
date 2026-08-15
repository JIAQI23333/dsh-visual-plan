/**
 * Right-hand task editor: title, description, type, status, dependencies,
 * plus save / cancel / delete. The same form serves both editing an existing
 * task and creating a new one.
 */

import { useState } from 'react'
import { TASK_STATUSES, TASK_TYPES, type PlanTask, type TaskStatus, type TaskType } from '../../schema/types.ts'
import type { VisualPlanT } from '../i18n.ts'
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
  t: VisualPlanT
  onSave: (draft: TaskDraft) => void
  onCancel: () => void
  onDelete?: () => void
}

function emptyDraft(): TaskDraft {
  return { title: '', description: '', type: 'other', status: 'pending', dependencies: [] }
}

export function TaskEditor(props: TaskEditorProps): JSX.Element {
  const { mode, task, tasks, confirmDelete = false, dependents = [], t, onSave, onCancel, onDelete } = props
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
      <div className={styles.heading}>{mode === 'new' ? t('editor.newTask') : t('editor.taskEditor')}</div>

      <label className={styles.field}>
        <span className={styles.label}>{t('editor.title')}</span>
        <input
          className={styles.input}
          value={draft.title}
          placeholder={t('editor.title')}
          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
        />
      </label>

      <label className={styles.field}>
        <span className={styles.label}>{t('editor.description')}</span>
        <textarea
          className={`${styles.input} ${styles.textarea}`}
          value={draft.description}
          rows={4}
          placeholder={t('editor.description')}
          onChange={(e) => setDraft({ ...draft, description: e.target.value })}
        />
      </label>

      <div className={styles.fieldRow}>
        <label className={styles.field}>
          <span className={styles.label}>{t('editor.type')}</span>
          <select
            className={styles.input}
            value={draft.type}
            onChange={(e) => setDraft({ ...draft, type: e.target.value as TaskType })}
          >
            {TASK_TYPES.map((type) => <option key={type} value={type}>{t(`taskType.${type}`)}</option>)}
          </select>
        </label>
        <label className={styles.field}>
          <span className={styles.label}>{t('editor.status')}</span>
          <select
            className={styles.input}
            value={draft.status}
            onChange={(e) => setDraft({ ...draft, status: e.target.value as TaskStatus })}
          >
            {TASK_STATUSES.map((status) => <option key={status} value={status}>{t(`taskStatus.${status}`)}</option>)}
          </select>
        </label>
      </div>

      <div className={styles.field}>
        <span className={styles.label}>{t('editor.dependencies')}</span>
        <div className={styles.deps}>
          {others.length === 0 && <div className={styles.depsEmpty}>{t('editor.noOtherTasks')}</div>}
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
        <button type="button" className={styles.button} onClick={onCancel}>{t('editor.cancel')}</button>
        <button
          type="button"
          className={`${styles.button} ${styles.primary}`}
          disabled={!valid}
          onClick={() => onSave(draft)}
        >
          {t('editor.save')}
        </button>
      </div>

      {mode === 'edit' && onDelete && (
        <div className={styles.deleteZone}>
          {confirmDelete ? (
            <>
              <div className={styles.deleteWarn}>
                {dependents.length > 0
                  ? t('editor.deleteConfirm', { count: String(dependents.length), names: dependents.map((d) => d.title).join(', ') })
                  : t('editor.deleteConfirmSimple')}
              </div>
              <div className={styles.actions}>
                <button type="button" className={styles.button} onClick={onCancel}>{t('editor.cancel')}</button>
                <button type="button" className={`${styles.button} ${styles.danger}`} onClick={onDelete}>
                  {t('editor.delete')}
                </button>
              </div>
            </>
          ) : (
            <button type="button" className={`${styles.button} ${styles.dangerGhost}`} onClick={onDelete}>
              {t('editor.delete')}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
