import assert from "node:assert/strict"
import test from "node:test"
import {
  parsePerformanceWindow,
  performanceWindowStart,
  summarizePerformanceRows,
  summarizeRuntimeEconomics,
  summarizeRuntimeIntelligence,
  summarizeRuntimeRlState,
} from "./summary"

test("parsePerformanceWindow defaults to 24h and validates values", () => {
  assert.equal(parsePerformanceWindow(undefined), "24h")
  assert.equal(parsePerformanceWindow(null), "24h")
  assert.equal(parsePerformanceWindow("1h"), "1h")
  assert.equal(parsePerformanceWindow("24h"), "24h")
  assert.equal(parsePerformanceWindow("7d"), "7d")
  assert.equal(parsePerformanceWindow("2h"), null)
})

test("performanceWindowStart returns the expected relative time", () => {
  const now = new Date("2026-02-11T12:00:00.000Z")
  assert.equal(performanceWindowStart("1h", now).toISOString(), "2026-02-11T11:00:00.000Z")
  assert.equal(performanceWindowStart("24h", now).toISOString(), "2026-02-10T12:00:00.000Z")
  assert.equal(performanceWindowStart("7d", now).toISOString(), "2026-02-04T12:00:00.000Z")
})

test("summarizePerformanceRows computes rates and percentiles", () => {
  const summary = summarizePerformanceRows([
    { status: "success", fallbackUsed: false, durationMs: 10 },
    { status: "success", fallbackUsed: true, durationMs: 20 },
    { status: "error", fallbackUsed: false, durationMs: 40 },
    { status: "backend_unavailable", fallbackUsed: false, durationMs: 100 },
  ])

  assert.equal(summary.count, 4)
  assert.equal(summary.errorRate, 0.5)
  assert.equal(summary.fallbackRate, 0.25)
  assert.equal(summary.p50, 30)
  assert.equal(summary.p95, 91)
})

test("summarizePerformanceRows handles empty datasets", () => {
  const summary = summarizePerformanceRows([])
  assert.deepEqual(summary, {
    count: 0,
    errorRate: 0,
    fallbackRate: 0,
    p50: null,
    p95: null,
  })
})

test("summarizeRuntimeEconomics aggregates savings, rewards, and threshold drift", () => {
  const summary = summarizeRuntimeEconomics([
    {
      estimatedCostUsd: 0.12,
      estimatedCostEur: 0.11,
      baselineMaxCostUsd: 0.2,
      baselineMaxCostEur: 0.18,
      estimatedSavingsUsd: 0.08,
      estimatedSavingsEur: 0.07,
      rewardScore: 0.6,
      thresholdBefore: 0.62,
      thresholdAfter: 0.66,
      economicsEstimated: true,
    },
    {
      estimatedCostUsd: 0.1,
      estimatedCostEur: 0.09,
      baselineMaxCostUsd: 0.21,
      baselineMaxCostEur: 0.19,
      estimatedSavingsUsd: 0.11,
      estimatedSavingsEur: 0.1,
      rewardScore: 0.8,
      thresholdBefore: 0.66,
      thresholdAfter: 0.64,
      economicsEstimated: true,
    },
  ])

  assert.equal(summary.samples, 2)
  assert.equal(summary.economicsSamples, 2)
  assert.equal(summary.estimatedCostUsd, 0.22)
  assert.equal(summary.baselineMaxCostUsd, 0.41)
  assert.equal(summary.estimatedSavingsUsd, 0.19)
  assert.equal(summary.rewardSamples, 2)
  assert.equal(summary.avgRewardScore, 0.7)
  assert.equal(summary.thresholdDriftSamples, 2)
  assert.equal(summary.avgThresholdDrift, 0.01)
  assert.equal(summary.avgAbsoluteThresholdDrift, 0.03)
})

test("summarizeRuntimeIntelligence computes tier and execution-kind adoption", () => {
  const summary = summarizeRuntimeIntelligence([
    { executionKind: "human_chat", intelligenceTier: "max", intelligenceDecision: "human_forced_max" },
    { executionKind: "autonomous_task", intelligenceTier: "simple", intelligenceDecision: "classifier_keep_simple" },
    { executionKind: "autonomous_task", intelligenceTier: "max", intelligenceDecision: "classifier_bump" },
  ])

  assert.equal(summary.samples, 3)
  assert.deepEqual(summary.byTier, [
    { key: "max", count: 2, rate: 0.6667 },
    { key: "simple", count: 1, rate: 0.3333 },
  ])
  assert.deepEqual(summary.byExecutionKind, [
    { key: "autonomous_task", count: 2, rate: 0.6667 },
    { key: "human_chat", count: 1, rate: 0.3333 },
  ])
})

test("summarizeRuntimeRlState reports policy state aggregates", () => {
  const summary = summarizeRuntimeRlState([
    {
      threshold: 0.62,
      explorationRate: 0.05,
      learningRate: 0.08,
      targetReward: 0.55,
      emaReward: 0.61,
      sampleCount: 12,
      lastConsolidatedAt: new Date("2026-02-11T00:00:00.000Z"),
    },
    {
      threshold: 0.68,
      explorationRate: 0.03,
      learningRate: 0.08,
      targetReward: 0.55,
      emaReward: 0.58,
      sampleCount: 9,
      lastConsolidatedAt: null,
    },
  ])

  assert.equal(summary.usersTracked, 2)
  assert.equal(summary.consolidatedUsers, 1)
  assert.equal(summary.totalSampleCount, 21)
  assert.equal(summary.avgThreshold, 0.65)
  assert.equal(summary.avgExplorationRate, 0.04)
  assert.equal(summary.maxSampleCount, 12)
  assert.equal(summary.lastConsolidatedAt, "2026-02-11T00:00:00.000Z")
})
