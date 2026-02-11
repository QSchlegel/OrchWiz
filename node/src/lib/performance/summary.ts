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

export interface RuntimeEconomicsAggregateInput {
  estimatedCostUsd: number | null
  estimatedCostEur: number | null
  baselineMaxCostUsd: number | null
  baselineMaxCostEur: number | null
  estimatedSavingsUsd: number | null
  estimatedSavingsEur: number | null
  rewardScore: number | null
  thresholdBefore: number | null
  thresholdAfter: number | null
  economicsEstimated: boolean | null
}

export interface RuntimeEconomicsAggregateSummary {
  samples: number
  economicsSamples: number
  estimatedCostUsd: number
  estimatedCostEur: number
  baselineMaxCostUsd: number
  baselineMaxCostEur: number
  estimatedSavingsUsd: number
  estimatedSavingsEur: number
  avgSavingsUsd: number | null
  avgSavingsEur: number | null
  rewardSamples: number
  avgRewardScore: number | null
  thresholdDriftSamples: number
  avgThresholdDrift: number | null
  avgAbsoluteThresholdDrift: number | null
}

export interface RuntimeIntelligenceAggregateInput {
  executionKind: string | null
  intelligenceTier: string | null
  intelligenceDecision: string | null
}

export interface RuntimeIntelligenceBucketSummary {
  key: string
  count: number
  rate: number
}

export interface RuntimeIntelligenceAggregateSummary {
  samples: number
  byTier: RuntimeIntelligenceBucketSummary[]
  byExecutionKind: RuntimeIntelligenceBucketSummary[]
  byDecision: RuntimeIntelligenceBucketSummary[]
}

export interface RuntimeRlStateAggregateInput {
  threshold: number
  explorationRate: number
  learningRate: number
  targetReward: number
  emaReward: number
  sampleCount: number
  lastConsolidatedAt: Date | null
}

export interface RuntimeRlStateAggregateSummary {
  usersTracked: number
  consolidatedUsers: number
  totalSampleCount: number
  avgThreshold: number | null
  avgExplorationRate: number | null
  avgLearningRate: number | null
  avgTargetReward: number | null
  avgEmaReward: number | null
  maxSampleCount: number
  lastConsolidatedAt: string | null
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

function finiteNumber(value: number | null | undefined): number | null {
  return Number.isFinite(value as number) ? Number(value) : null
}

function sum(values: number[]): number {
  let total = 0
  for (const value of values) {
    total += value
  }
  return total
}

function average(values: number[]): number | null {
  if (values.length === 0) {
    return null
  }
  return sum(values) / values.length
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

export function summarizeRuntimeEconomics(rows: RuntimeEconomicsAggregateInput[]): RuntimeEconomicsAggregateSummary {
  const economicsRows = rows.filter((row) => (
    row.economicsEstimated === true
    || finiteNumber(row.estimatedCostUsd) !== null
    || finiteNumber(row.baselineMaxCostUsd) !== null
  ))

  const estimatedCostUsd = sum(economicsRows.map((row) => finiteNumber(row.estimatedCostUsd) || 0))
  const estimatedCostEur = sum(economicsRows.map((row) => finiteNumber(row.estimatedCostEur) || 0))
  const baselineMaxCostUsd = sum(economicsRows.map((row) => finiteNumber(row.baselineMaxCostUsd) || 0))
  const baselineMaxCostEur = sum(economicsRows.map((row) => finiteNumber(row.baselineMaxCostEur) || 0))
  const estimatedSavingsUsd = sum(economicsRows.map((row) => finiteNumber(row.estimatedSavingsUsd) || 0))
  const estimatedSavingsEur = sum(economicsRows.map((row) => finiteNumber(row.estimatedSavingsEur) || 0))

  const rewardValues = rows
    .map((row) => finiteNumber(row.rewardScore))
    .filter((value): value is number => value !== null)

  const thresholdDriftValues = rows
    .map((row) => {
      const before = finiteNumber(row.thresholdBefore)
      const after = finiteNumber(row.thresholdAfter)
      if (before === null || after === null) {
        return null
      }
      return after - before
    })
    .filter((value): value is number => value !== null)

  const absoluteDriftValues = thresholdDriftValues.map((value) => Math.abs(value))

  const avgSavingsUsd = average(
    economicsRows
      .map((row) => finiteNumber(row.estimatedSavingsUsd))
      .filter((value): value is number => value !== null),
  )
  const avgSavingsEur = average(
    economicsRows
      .map((row) => finiteNumber(row.estimatedSavingsEur))
      .filter((value): value is number => value !== null),
  )
  const avgRewardScore = average(rewardValues)
  const avgThresholdDrift = average(thresholdDriftValues)
  const avgAbsoluteThresholdDrift = average(absoluteDriftValues)

  return {
    samples: rows.length,
    economicsSamples: economicsRows.length,
    estimatedCostUsd: round(estimatedCostUsd, 8),
    estimatedCostEur: round(estimatedCostEur, 8),
    baselineMaxCostUsd: round(baselineMaxCostUsd, 8),
    baselineMaxCostEur: round(baselineMaxCostEur, 8),
    estimatedSavingsUsd: round(estimatedSavingsUsd, 8),
    estimatedSavingsEur: round(estimatedSavingsEur, 8),
    avgSavingsUsd: avgSavingsUsd === null ? null : round(avgSavingsUsd, 8),
    avgSavingsEur: avgSavingsEur === null ? null : round(avgSavingsEur, 8),
    rewardSamples: rewardValues.length,
    avgRewardScore: avgRewardScore === null ? null : round(avgRewardScore, 6),
    thresholdDriftSamples: thresholdDriftValues.length,
    avgThresholdDrift: avgThresholdDrift === null ? null : round(avgThresholdDrift, 6),
    avgAbsoluteThresholdDrift: avgAbsoluteThresholdDrift === null ? null : round(avgAbsoluteThresholdDrift, 6),
  }
}

function summarizeBuckets(values: Array<string | null | undefined>): RuntimeIntelligenceBucketSummary[] {
  const total = values.length
  const grouped = new Map<string, number>()

  for (const value of values) {
    const key = typeof value === "string" && value.trim().length > 0 ? value.trim() : "unknown"
    grouped.set(key, (grouped.get(key) || 0) + 1)
  }

  return [...grouped.entries()]
    .map(([key, count]) => ({
      key,
      count,
      rate: total === 0 ? 0 : round(count / total, 4),
    }))
    .sort((left, right) => right.count - left.count || left.key.localeCompare(right.key))
}

export function summarizeRuntimeIntelligence(rows: RuntimeIntelligenceAggregateInput[]): RuntimeIntelligenceAggregateSummary {
  return {
    samples: rows.length,
    byTier: summarizeBuckets(rows.map((row) => row.intelligenceTier)),
    byExecutionKind: summarizeBuckets(rows.map((row) => row.executionKind)),
    byDecision: summarizeBuckets(rows.map((row) => row.intelligenceDecision)),
  }
}

export function summarizeRuntimeRlState(rows: RuntimeRlStateAggregateInput[]): RuntimeRlStateAggregateSummary {
  if (rows.length === 0) {
    return {
      usersTracked: 0,
      consolidatedUsers: 0,
      totalSampleCount: 0,
      avgThreshold: null,
      avgExplorationRate: null,
      avgLearningRate: null,
      avgTargetReward: null,
      avgEmaReward: null,
      maxSampleCount: 0,
      lastConsolidatedAt: null,
    }
  }

  let consolidatedUsers = 0
  let totalSampleCount = 0
  let maxSampleCount = 0
  let latestConsolidatedAt: Date | null = null

  for (const row of rows) {
    totalSampleCount += Math.max(0, Math.round(row.sampleCount))
    maxSampleCount = Math.max(maxSampleCount, Math.max(0, Math.round(row.sampleCount)))

    if (row.lastConsolidatedAt) {
      consolidatedUsers += 1
      if (!latestConsolidatedAt || row.lastConsolidatedAt > latestConsolidatedAt) {
        latestConsolidatedAt = row.lastConsolidatedAt
      }
    }
  }

  const avgThreshold = average(rows.map((row) => row.threshold))
  const avgExplorationRate = average(rows.map((row) => row.explorationRate))
  const avgLearningRate = average(rows.map((row) => row.learningRate))
  const avgTargetReward = average(rows.map((row) => row.targetReward))
  const avgEmaReward = average(rows.map((row) => row.emaReward))

  return {
    usersTracked: rows.length,
    consolidatedUsers,
    totalSampleCount,
    avgThreshold: avgThreshold === null ? null : round(avgThreshold, 6),
    avgExplorationRate: avgExplorationRate === null ? null : round(avgExplorationRate, 6),
    avgLearningRate: avgLearningRate === null ? null : round(avgLearningRate, 6),
    avgTargetReward: avgTargetReward === null ? null : round(avgTargetReward, 6),
    avgEmaReward: avgEmaReward === null ? null : round(avgEmaReward, 6),
    maxSampleCount,
    lastConsolidatedAt: latestConsolidatedAt ? latestConsolidatedAt.toISOString() : null,
  }
}
