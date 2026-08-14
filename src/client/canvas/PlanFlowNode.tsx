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
import styles from './PlanCanvas.module.css'

const TYPE_ICONS: Record<PlanTask['type'], string> = {
  analysis: '🔍',
  design: '📐',
  coding: '💻',
  testing: '🧪',
  refactor: '🔧',
  other: '●',
}

const STATUS_LABEL: Record<TaskStatus, string> = {
  pending: 'Pending',
  running: 'Running',
  completed: 'Completed',
  failed: 'Failed',
  skipped: 'Skipped',
}

/** React Flow node data payload. */
export interface PlanNodeData {
  task: PlanTask
  /** Task titles by id, for the "Depends:" line. */
  titleById: ReadonlyMap<string, string>
  /** Whether this node is currently selected. */
  selected: boolean
  [key: string]: unknown
}

/** The React Flow node type used by this canvas. */
export type PlanFlowNodeType = Node<PlanNodeData, 'plan'>

export const PlanFlowNode = memo(function PlanFlowNode(props: NodeProps<PlanFlowNodeType>): JSX.Element {
  const { data } = props
  const { task, titleById, selected } = data
  const depends = task.dependencies
    .map((id) => titleById.get(id) ?? id)
    .slice(0, 3)
    .join(', ')

  return (
    <div className={`${styles.node} ${selected ? styles.nodeSelected : ''}`}>
      <Handle type="target" position={Position.Left} />
      <div className={styles.nodeHeader}>
        <span className={styles.nodeType}>
          <span aria-hidden="true">{TYPE_ICONS[task.type]}</span>
          <span className={styles.nodeTypeLabel}>{task.type}</span>
        </span>
        <span className={`${styles.statusChip} ${styles[`status${task.status}`]}`}>{STATUS_LABEL[task.status]}</span>
      </div>
      <div className={styles.nodeTitle}>{task.title}</div>
      {task.description !== '' && <div className={styles.nodeDescription}>{task.description}</div>}
      {depends !== '' && <div className={styles.nodeDepends}>Depends: {depends}</div>}
      <Handle type="source" position={Position.Right} />
    </div>
  )
})
