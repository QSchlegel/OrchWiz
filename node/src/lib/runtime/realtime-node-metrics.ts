import type { NodeRuntimeMetrics, NodeRuntimeStatus } from "@/lib/runtime/node-metrics"

export const RUNTIME_NODE_METRICS_EVENT_TYPE = "runtime.node.metrics.updated" as const

export type RuntimeNodeMetricsPayload = NodeRuntimeMetrics

const NODE_RUNTIME_STATUSES = new Set<NodeRuntimeStatus>(["healthy", "elevated", "degraded"])

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null
  }
  return value as Record<string, unknown>
}

function asFiniteNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null
  }
  return value
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null
  }
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function parseStatus(value: unknown): NodeRuntimeStatus | null {
  if (typeof value !== "string") {
    return null
  }
  return NODE_RUNTIME_STATUSES.has(value as NodeRuntimeStatus) ? (value as NodeRuntimeStatus) : null
}

export function parseRuntimeNodeMetricsPayload(value: unknown): RuntimeNodeMetricsPayload | null {
  const record = asRecord(value)
  if (!record) {
    return null
  }

  const capturedAt = asNonEmptyString(record.capturedAt)
  const status = parseStatus(record.status)
  const signals = asRecord(record.signals)

  if (!capturedAt || !status || !signals) {
    return null
  }

  const cpuPercent = asFiniteNumber(signals.cpuPercent)
  const heapPressurePercent = asFiniteNumber(signals.heapPressurePercent)
  const eventLoopLagP95Ms = asFiniteNumber(signals.eventLoopLagP95Ms)
  const rssBytes = asFiniteNumber(signals.rssBytes)
  const heapUsedBytes = asFiniteNumber(signals.heapUsedBytes)
  const heapTotalBytes = asFiniteNumber(signals.heapTotalBytes)
  const uptimeSec = asFiniteNumber(signals.uptimeSec)

  if (
    cpuPercent === null
    || heapPressurePercent === null
    || eventLoopLagP95Ms === null
    || rssBytes === null
    || heapUsedBytes === null
    || heapTotalBytes === null
    || uptimeSec === null
  ) {
    return null
  }

  return {
    capturedAt,
    status,
    signals: {
      cpuPercent,
      heapPressurePercent,
      eventLoopLagP95Ms,
      rssBytes,
      heapUsedBytes,
      heapTotalBytes,
      uptimeSec,
    },
  }
}

export function isRuntimeNodeMetricsPayload(value: unknown): value is RuntimeNodeMetricsPayload {
  return parseRuntimeNodeMetricsPayload(value) !== null
}
