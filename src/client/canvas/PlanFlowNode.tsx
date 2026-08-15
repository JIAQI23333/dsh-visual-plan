/**
 * React Flow node component for one plan task.
 *
 * Visual identity per task type (spec §7):
 *   analysis → 🔍  design → 📐  coding → 💻
 *   testing → 🧪  refactor → 🔧  other → ●
 */

import { memo } from 'react'
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import type { PlanTask, TaskStatus } from '../../schema/types.ts'
import type { VisualPlanT } from '../i18n.ts'
import styles from './PlanCanvas.module.css'

const TYPE_ICONS: Record<PlanTask['type'], string> = {
  analysis: '🔍',
  design: '📐',
  coding: '💻',
  testing: '🧪',
  refactor: '🔧',
  other: '●',
}

/** React Flow node data payload. */
export interface PlanNodeData {
  task: PlanTask
  /** Task titles by id, for the "Depends:" line. */
  titleById: ReadonlyMap<string, string>
  /** Localized copy. */
  t: VisualPlanT
  /** Whether this node is currently selected. */
  selected: boolean
  [key: string]: unknown
}

/** The React Flow node type used by this canvas. */
export type PlanFlowNodeType = Node<PlanNodeData, 'plan'>

export const PlanFlowNode = memo(function PlanFlowNode(props: NodeProps<PlanFlowNodeType>): JSX.Element {
  const { data } = props
  const { task, titleById, t, selected } = data
  const depends = task.dependencies
    .map((id) => titleById.get(id) ?? id)
    .slice(0, 3)
    .join(', ')
  const statusLabel: Record<TaskStatus, string> = {
    pending: t('taskStatus.pending'),
    running: t('taskStatus.running'),
    completed: t('taskStatus.completed'),
    failed: t('taskStatus.failed'),
    skipped: t('taskStatus.skipped'),
  }

  return (
    <div className={`${styles.node} ${selected ? styles.nodeSelected : ''}`}>
      <Handle type="target" position={Position.Left} />
      <div className={styles.nodeHeader}>
        <span className={styles.nodeType}>
          <span aria-hidden="true">{TYPE_ICONS[task.type]}</span>
          <span className={styles.nodeTypeLabel}>{t(`taskType.${task.type}`)}</span>
        </span>
        <span className={`${styles.statusChip} ${styles[`status${task.status}`]}`}>{statusLabel[task.status]}</span>
      </div>
      <div className={styles.nodeTitle}>{task.title}</div>
      {task.description !== '' && <div className={styles.nodeDescription}>{task.description}</div>}
      {depends !== '' && <div className={styles.nodeDepends}>{t('node.depends')} {depends}</div>}
      <Handle type="source" position={Position.Right} />
    </div>
  )
})
