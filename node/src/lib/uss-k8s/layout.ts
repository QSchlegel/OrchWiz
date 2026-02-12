import type { Node, XYPosition } from "reactflow"

const USS_K8S_STRUCTURAL_LAYOUT: Record<string, XYPosition> = {
  // Left panel: operator + bridge command lane
  qs: { x: 120, y: 100 },
  ui: { x: 340, y: 100 },
  xo: { x: 120, y: 210 },
  ops: { x: 300, y: 210 },
  eng: { x: 480, y: 210 },
  sec: { x: 120, y: 320 },
  med: { x: 300, y: 320 },
  cou: { x: 480, y: 320 },

  // Left panel: runtime control lane
  gw: { x: 120, y: 470 },
  cron: { x: 300, y: 470 },
  state: { x: 480, y: 470 },

  // Right panel: execution substrate + observability stack
  app: { x: 860, y: 210 },
  nodes: { x: 1060, y: 210 },
  evt: { x: 1260, y: 210 },
  loki: { x: 860, y: 360 },
  prom: { x: 1060, y: 360 },
  graf: { x: 1260, y: 360 },
  lf: { x: 860, y: 510 },
  ch: { x: 1060, y: 510 },
}

const FALLBACK_POSITION: XYPosition = { x: 80, y: 1020 }

const NODE_POSITIONS_STORAGE_KEY = "orchwiz:uss-k8s-node-positions"

function isFinitePosition(value: unknown): value is XYPosition {
  if (typeof value !== "object" || value === null) return false
  const candidate = value as Partial<XYPosition>
  return Number.isFinite(candidate.x) && Number.isFinite(candidate.y)
}

function sanitizePositions(raw: unknown): Record<string, XYPosition> {
  if (typeof raw !== "object" || raw === null) return {}
  const entries = Object.entries(raw as Record<string, unknown>)
  const sanitized: Record<string, XYPosition> = {}

  for (const [id, value] of entries) {
    if (!isFinitePosition(value)) continue
    sanitized[id] = { x: value.x, y: value.y }
  }

  return sanitized
}

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
    if (!custom || !isFinitePosition(custom)) return node
    return { ...node, position: custom }
  })
}

export function readNodePositions(): Record<string, XYPosition> {
  if (typeof window === "undefined") return {}
  try {
    const raw = window.localStorage.getItem(NODE_POSITIONS_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return sanitizePositions(parsed)
  } catch {
    return {}
  }
}

export function writeNodePositions(positions: Record<string, XYPosition>): void {
  if (typeof window === "undefined") return
  const sanitized = sanitizePositions(positions)
  window.localStorage.setItem(NODE_POSITIONS_STORAGE_KEY, JSON.stringify(sanitized))
}

export function clearNodePositions(): void {
  if (typeof window === "undefined") return
  window.localStorage.removeItem(NODE_POSITIONS_STORAGE_KEY)
}
