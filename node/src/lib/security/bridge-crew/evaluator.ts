import type { BridgeCrewRole } from "@prisma/client"
import type {
  BridgeCrewScenarioResult,
  BridgeCrewScorecard,
  BridgeCrewStationMetrics,
  BridgeCrewStressMode,
  BridgeCrewStressScenario,
} from "./types"

const STATION_WEIGHTS: Record<BridgeCrewRole, number> = {
  xo: 0.18,
  ops: 0.18,
  eng: 0.16,
  sec: 0.2,
  med: 0.12,
  cou: 0.16,
}

const ALL_STATIONS: BridgeCrewRole[] = ["xo", "ops", "eng", "sec", "med", "cou"]

function clampScore(value: number): number {
  if (!Number.isFinite(value)) {
    return 0
  }

  return Math.max(0, Math.min(100, Math.round(value)))
}

function evaluateScenario(
  scenario: BridgeCrewStressScenario,
  metrics: BridgeCrewStationMetrics,
): BridgeCrewScenarioResult {
  const notes: string[] = []
  let score = 100
  let passed = true

  const minSampleSize = scenario.minSampleSize ?? 0
  if (metrics.total < minSampleSize) {
    notes.push(`Insufficient samples (${metrics.total}/${minSampleSize})`)
    score -= 45
    passed = false
  }

  if (scenario.minSuccessRate !== undefined && metrics.successRate < scenario.minSuccessRate) {
    const gap = scenario.minSuccessRate - metrics.successRate
    notes.push(`Success rate ${metrics.successRate.toFixed(2)} below ${scenario.minSuccessRate.toFixed(2)}`)
    score -= 60 * gap
    passed = false
  }

  if (scenario.maxRetryRate !== undefined && metrics.retryRate > scenario.maxRetryRate) {
    const overflow = metrics.retryRate - scenario.maxRetryRate
    notes.push(`Retry rate ${metrics.retryRate.toFixed(2)} above ${scenario.maxRetryRate.toFixed(2)}`)
    score -= 50 * overflow
    passed = false
  }

  if (
    scenario.maxP95LatencyMs !== undefined
    && metrics.p95LatencyMs !== null
    && metrics.p95LatencyMs > scenario.maxP95LatencyMs
  ) {
    const overflowRatio = (metrics.p95LatencyMs - scenario.maxP95LatencyMs) / scenario.maxP95LatencyMs
    notes.push(`P95 latency ${Math.round(metrics.p95LatencyMs)}ms above ${scenario.maxP95LatencyMs}ms`)
    score -= 40 * Math.max(0, overflowRatio)
    passed = false
  }

  if (notes.length === 0) {
    notes.push("All checks within expected thresholds")
  }

  return {
    scenarioId: scenario.id,
    stationKey: scenario.stationKey,
    title: scenario.title,
    threatId: scenario.threatId,
    passed,
    score: clampScore(score),
    notes,
  }
}

export function evaluateBridgeCrewScenarios(args: {
  userId: string
  mode: BridgeCrewStressMode
  scenarioPack: "core" | "extended"
  scenarios: BridgeCrewStressScenario[]
  metricsByStation: Record<BridgeCrewRole, BridgeCrewStationMetrics>
  generatedAt?: Date
}): BridgeCrewScorecard {
  const scenarioResults = args.scenarios.map((scenario) =>
    evaluateScenario(scenario, args.metricsByStation[scenario.stationKey]),
  )

  const perStationScores: Record<BridgeCrewRole, number> = {
    xo: 0,
    ops: 0,
    eng: 0,
    sec: 0,
    med: 0,
    cou: 0,
  }

  for (const station of ALL_STATIONS) {
    const stationResults = scenarioResults.filter((result) => result.stationKey === station)
    if (stationResults.length === 0) {
      perStationScores[station] = 0
      continue
    }

    const sum = stationResults.reduce((acc, result) => acc + result.score, 0)
    perStationScores[station] = clampScore(sum / stationResults.length)
  }

  const weighted = ALL_STATIONS.reduce((acc, station) => {
    return acc + perStationScores[station] * STATION_WEIGHTS[station]
  }, 0)

  const sampleSize = ALL_STATIONS.reduce((acc, station) => acc + args.metricsByStation[station].total, 0)

  return {
    userId: args.userId,
    mode: args.mode,
    scenarioPack: args.scenarioPack,
    overallScore: clampScore(weighted),
    perStationScores,
    failingScenarios: scenarioResults.filter((result) => !result.passed).map((result) => result.scenarioId),
    scenarioResults,
    generatedAt: (args.generatedAt || new Date()).toISOString(),
    sampleSize,
  }
}
