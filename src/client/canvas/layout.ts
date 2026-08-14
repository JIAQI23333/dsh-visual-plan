/**
 * DAG auto layout (dagre, left-to-right).
 *
 * v1 goal: no node overlap + clear dependency flow. Positions are computed
 * for every task; the canvas re-runs this on structural changes and on the
 * manual "Auto layout" action. Manual drags win until the next layout.
 */

import dagre from 'dagre'
import type { VisualPlan } from '../../schema/types.ts'

export const NODE_WIDTH = 220

function estimateHeight(task: VisualPlan['tasks'][number]): number {
  const titleLines = Math.ceil(task.title.length / 24)
  const descLines = task.description === '' ? 0 : task.description.split('\n').reduce((n, l) => n + Math.ceil(l.length / 28), 0)
  const depLines = task.dependencies.length === 0 ? 0 : 1
  return Math.max(72, 56 + titleLines * 18 + descLines * 16 + depLines * 16 + 8)
}

export type PlanPositions = Record<string, { x: number; y: number }>

/** Lay the whole plan out left-to-right; returns top-left positions per task. */
export function layoutPlan(plan: VisualPlan): PlanPositions {
  const graph = new dagre.graphlib.Graph()
  graph.setDefaultEdgeLabel(() => ({}))
  graph.setGraph({ rankdir: 'LR', nodesep: 28, ranksep: 56, marginx: 24, marginy: 24 })

  for (const task of plan.tasks) {
    graph.setNode(task.id, { width: NODE_WIDTH, height: estimateHeight(task) })
  }
  for (const edge of plan.edges) {
    graph.setEdge(edge.source, edge.target)
  }

  dagre.layout(graph)

  const positions: PlanPositions = {}
  for (const task of plan.tasks) {
    const node = graph.node(task.id)
    if (!node) continue
    positions[task.id] = {
      x: node.x - NODE_WIDTH / 2,
      y: node.y - node.height / 2,
    }
  }
  return positions
}
