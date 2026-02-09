import type { Node, XYPosition } from "reactflow"

const USS_K8S_STRUCTURAL_LAYOUT: Record<string, XYPosition> = {
  // Operator interfaces
  qs: { x: 580, y: 90 },
  ui: { x: 790, y: 90 },

  // Bridge crew lane
  xo: { x: 560, y: 180 },
  ops: { x: 500, y: 270 },
  eng: { x: 660, y: 270 },
  sec: { x: 820, y: 270 },
  med: { x: 980, y: 270 },
  cou: { x: 1140, y: 270 },

  // Runtime control lane
  gw: { x: 540, y: 430 },
  cron: { x: 760, y: 430 },
  state: { x: 980, y: 430 },

  // Telemetry source lane
  lf: { x: 430, y: 610 },
  app: { x: 650, y: 610 },
  nodes: { x: 870, y: 610 },
  evt: { x: 1090, y: 610 },

  // Storage/metrics lane
  ch: { x: 430, y: 770 },
  loki: { x: 650, y: 770 },
  prom: { x: 870, y: 770 },

  // Dashboard + alerts sink
  graf: { x: 870, y: 930 },
}

const FALLBACK_POSITION: XYPosition = { x: 80, y: 1020 }

const NODE_POSITIONS_STORAGE_KEY = "orchwiz:uss-k8s-node-positions"

export function layoutUssK8sTopology<T extends Node>(nodes: T[]): T[] {
  return nodes.map((node, index) => {
    const position = USS_K8S_STRUCTURAL_LAYOUT[node.id] || {
      x: FALLBACK_POSITION.x + index * 220,
      y: FALLBACK_POSITION.y,
    }

    return {
      ...node,
      position,
    }
  })
}

export function mergeCustomPositions<T extends Node>(
  nodes: T[],
  overrides: Record<string, XYPosition>,
): T[] {
  if (Object.keys(overrides).length === 0) return nodes
  return nodes.map((node) => {
    const custom = overrides[node.id]
    if (!custom) return node
    return { ...node, position: custom }
  })
}

export function readNodePositions(): Record<string, XYPosition> {
  if (typeof window === "undefined") return {}
  try {
    const raw = window.localStorage.getItem(NODE_POSITIONS_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (typeof parsed !== "object" || parsed === null) return {}
    return parsed
  } catch {
    return {}
  }
}

export function writeNodePositions(positions: Record<string, XYPosition>): void {
  if (typeof window === "undefined") return
  window.localStorage.setItem(NODE_POSITIONS_STORAGE_KEY, JSON.stringify(positions))
}

export function clearNodePositions(): void {
  if (typeof window === "undefined") return
  window.localStorage.removeItem(NODE_POSITIONS_STORAGE_KEY)
}
