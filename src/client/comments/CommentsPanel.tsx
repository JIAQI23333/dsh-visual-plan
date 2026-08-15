/**
 * Minimal per-task comment list + composer (spec §11).
 */

import { useState } from 'react'
import type { PlanComment } from '../../schema/types.ts'
import type { VisualPlanT } from '../i18n.ts'
import styles from './CommentsPanel.module.css'

interface CommentsPanelProps {
  taskId: string
  comments: readonly PlanComment[]
  t: VisualPlanT
  onAdd: (content: string) => void
  onRemove: (commentId: string) => void
}

export function CommentsPanel(props: CommentsPanelProps): JSX.Element {
  const { taskId, comments, t, onAdd, onRemove } = props
  const [draft, setDraft] = useState('')

  const submit = (): void => {
    if (draft.trim() === '') return
    onAdd(draft)
    setDraft('')
  }

  return (
    <div className={styles.panel}>
      <div className={styles.heading}>{t('comment.title')}</div>
      {comments.length === 0 && <div className={styles.empty}>{t('comment.none')}</div>}
      <ul className={styles.list}>
        {comments.map((comment) => (
          <li key={comment.id} className={styles.item}>
            <div className={styles.meta}>
              <span className={styles.author}>{comment.author}</span>
              <span className={styles.time}>{new Date(comment.createdAt).toLocaleString()}</span>
              <button type="button" className={styles.remove} aria-label={t('comment.removeAria')} onClick={() => onRemove(comment.id)}>
                ×
              </button>
            </div>
            <div className={styles.content}>{comment.content}</div>
          </li>
        ))}
      </ul>
      <div className={styles.composer}>
        <textarea
          className={styles.input}
          rows={2}
          value={draft}
          placeholder={t('comment.placeholder', { taskId })}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit()
          }}
        />
        <button type="button" className={styles.button} disabled={draft.trim() === ''} onClick={submit}>
          {t('comment.add')}
        </button>
      </div>
    </div>
  )
}
