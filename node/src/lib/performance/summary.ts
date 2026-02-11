export type PerformanceWindow = "1h" | "24h" | "7d"

export interface PerformanceAggregateInput {
  status: string
  fallbackUsed: boolean
  durationMs: number
}

export interface PerformanceAggregateSummary {
  count: number
  errorRate: number
  fallbackRate: number
  p50: number | null
  p95: number | null
}

const WINDOW_TO_MS: Record<PerformanceWindow, number> = {
  "1h": 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
}

export function parsePerformanceWindow(value: string | null | undefined): PerformanceWindow | null {
  if (!value) {
    return "24h"
  }

  return value === "1h" || value === "24h" || value === "7d" ? value : null
}

export function performanceWindowStart(window: PerformanceWindow, now = new Date()): Date {
  return new Date(now.getTime() - WINDOW_TO_MS[window])
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function percentile(values: number[], percentileRank: number): number | null {
  if (values.length === 0) {
    return null
  }

  const sorted = [...values].sort((left, right) => left - right)
  if (sorted.length === 1) {
    return sorted[0]
  }

  const normalizedPercentile = Math.max(0, Math.min(100, percentileRank))
  const rawIndex = (normalizedPercentile / 100) * (sorted.length - 1)
  const lower = Math.floor(rawIndex)
  const upper = Math.ceil(rawIndex)
  if (lower === upper) {
    return sorted[lower]
  }

  const weight = rawIndex - lower
  return sorted[lower] + (sorted[upper] - sorted[lower]) * weight
}

export function summarizePerformanceRows(rows: PerformanceAggregateInput[]): PerformanceAggregateSummary {
  const count = rows.length
  if (count === 0) {
    return {
      count: 0,
      errorRate: 0,
      fallbackRate: 0,
      p50: null,
      p95: null,
    }
  }

  const durations = rows.map((row) => row.durationMs).filter((value) => Number.isFinite(value) && value >= 0)
  const errors = rows.filter((row) => row.status !== "success").length
  const fallbackCount = rows.filter((row) => row.fallbackUsed).length
  const p50 = percentile(durations, 50)
  const p95 = percentile(durations, 95)

  return {
    count,
    errorRate: round(errors / count, 4),
    fallbackRate: round(fallbackCount / count, 4),
    p50: p50 === null ? null : round(p50, 3),
    p95: p95 === null ? null : round(p95, 3),
  }
}
