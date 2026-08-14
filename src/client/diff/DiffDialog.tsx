/**
 * Apply Changes confirmation dialog (spec §12).
 *
 * Shows REMOVED / MODIFIED / ADDED / DEPENDENCY CHANGED before the user
 * submits, then persists a version and hands the revised plan to DSH.
 */

import type { PlanDiff } from '../../schema/types.ts'
import styles from './DiffDialog.module.css'

interface DiffDialogProps {
  open: boolean
  diff: PlanDiff
  titleById: ReadonlyMap<string, string>
  submitting: boolean
  error: string | null
  onCancel: () => void
  onConfirm: () => void
}

function name(id: string, titleById: ReadonlyMap<string, string>): string {
  return titleById.get(id) ?? id
}

export function DiffDialog(props: DiffDialogProps): JSX.Element | null {
  const { open, diff, titleById, submitting, error, onCancel, onConfirm } = props
  if (!open) return null

  const hasChanges = diff.added.length > 0 || diff.removed.length > 0 || diff.modified.length > 0
    || diff.dependencyChanges.length > 0 || diff.commentChanges.length > 0

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label="Plan changes">
      <div className={styles.dialog}>
        <div className={styles.heading}>Plan Changes</div>
        <div className={styles.scroll}>
          {!hasChanges && <div className={styles.none}>No structural changes to report.</div>}

          {diff.removed.length > 0 && (
            <section className={styles.section}>
              <div className={styles.sectionTitle}>REMOVED</div>
              {diff.removed.map((t) => <div key={t.id} className={`${styles.row} ${styles.removed}`}>− {t.title}</div>)}
            </section>
          )}

          {diff.modified.length > 0 && (
            <section className={styles.section}>
              <div className={styles.sectionTitle}>MODIFIED</div>
              {diff.modified.map((t) => (
                <div key={t.id} className={`${styles.row} ${styles.modified}`}>
                  ~ {t.title}
                  <span className={styles.fields}>({t.fields.join(', ')})</span>
                </div>
              ))}
            </section>
          )}

          {diff.added.length > 0 && (
            <section className={styles.section}>
              <div className={styles.sectionTitle}>ADDED</div>
              {diff.added.map((t) => <div key={t.id} className={`${styles.row} ${styles.added}`}>+ {t.title}</div>)}
            </section>
          )}

          {diff.dependencyChanges.length > 0 && (
            <section className={styles.section}>
              <div className={styles.sectionTitle}>DEPENDENCY CHANGED</div>
              {diff.dependencyChanges.map((c) => {
                const bits: string[] = []
                if (c.removed.length > 0) bits.push(`− ${c.removed.map((id) => name(id, titleById)).join(', ')}`)
                if (c.added.length > 0) bits.push(`+ ${c.added.map((id) => name(id, titleById)).join(', ')}`)
                return (
                  <div key={c.taskId} className={`${styles.row} ${styles.dep}`}>
                    {name(c.taskId, titleById)}: {bits.join('  ')}
                  </div>
                )
              })}
            </section>
          )}

          {diff.commentChanges.length > 0 && (
            <section className={styles.section}>
              <div className={styles.sectionTitle}>COMMENTS</div>
              {diff.commentChanges.map((c) => (
                <div key={c.taskId} className={`${styles.row} ${styles.dep}`}>
                  {name(c.taskId, titleById)}: {c.added > 0 ? `+${c.added} added ` : ''}{c.removed > 0 ? `−${c.removed} removed` : ''}
                </div>
              ))}
            </section>
          )}

          {error && <div className={styles.error}>{error}</div>}
        </div>
        <div className={styles.footer}>
          <button type="button" className={styles.button} disabled={submitting} onClick={onCancel}>Cancel</button>
          <button type="button" className={`${styles.button} ${styles.primary}`} disabled={submitting} onClick={onConfirm}>
            {submitting ? 'Submitting…' : 'Submit Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}
