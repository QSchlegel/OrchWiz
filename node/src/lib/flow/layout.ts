import type { Node, XYPosition } from "reactflow"

export function layoutRadial<T extends Node>(center: XYPosition, nodes: T[], radius: number) {
  if (nodes.length === 0) return [] as T[]
  const angleStep = (Math.PI * 2) / nodes.length
  return nodes.map((node, index) => {
    const angle = angleStep * index - Math.PI / 2
    return {
      ...node,
      position: {
        x: center.x + radius * Math.cos(angle),
        y: center.y + radius * Math.sin(angle),
      },
    }
  })
}

export function layoutColumns<T extends Node>(
  groups: { key: string; nodes: T[] }[],
  columnWidth = 260,
  rowGap = 140,
  start: XYPosition = { x: 0, y: 0 }
) {
  const arranged: T[] = []
  groups.forEach((group, columnIndex) => {
    group.nodes.forEach((node, rowIndex) => {
      arranged.push({
        ...node,
        position: {
          x: start.x + columnIndex * columnWidth,
          y: start.y + rowIndex * rowGap,
        },
      })
    })
  })
  return arranged
}

export function layoutTimeline<T extends Node>(nodes: T[], spacing = 260, start: XYPosition = { x: 0, y: 0 }) {
  return nodes.map((node, index) => ({
    ...node,
    position: {
      x: start.x + index * spacing,
      y: start.y,
    },
  }))
}

/**
 * Lay out groups as horizontal rows stacked vertically.
 * Each group's nodes are spread along the X axis and centered.
 */
export function layoutRows<T extends Node>(
  groups: { key: string; nodes: T[] }[],
  rowGap = 200,
  columnGap = 220,
  start: XYPosition = { x: 0, y: 0 }
): T[] {
  const arranged: T[] = []
  groups.forEach((group, rowIndex) => {
    const groupWidth = group.nodes.length * columnGap
    const startX = start.x - groupWidth / 2 + columnGap / 2
    group.nodes.forEach((node, colIndex) => {
      arranged.push({
        ...node,
        position: {
          x: startX + colIndex * columnGap,
          y: start.y + rowIndex * rowGap,
        },
      })
    })
  })
  return arranged
}
