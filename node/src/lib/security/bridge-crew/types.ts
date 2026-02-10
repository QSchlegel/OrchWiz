import type { BridgeCrewRole } from "@prisma/client"

export type BridgeCrewScenarioPack = "core" | "extended"
export type BridgeCrewStressMode = "safe_sim" | "live"

export interface BridgeCrewStressScenario {
  id: string
  pack: BridgeCrewScenarioPack
  stationKey: BridgeCrewRole
  title: string
  threatId: string
  maxRetryRate?: number
  minSuccessRate?: number
  maxP95LatencyMs?: number
  minSampleSize?: number
  description: string
}

export interface BridgeCrewStationMetrics {
  stationKey: BridgeCrewRole
  total: number
  success: number
  failed: number
  offline: number
  retryRate: number
  successRate: number
  p95LatencyMs: number | null
}

export interface BridgeCrewScenarioResult {
  scenarioId: string
  stationKey: BridgeCrewRole
  title: string
  threatId: string
  passed: boolean
  score: number
  notes: string[]
}

export interface BridgeCrewScorecard {
  userId: string
  mode: BridgeCrewStressMode
  scenarioPack: BridgeCrewScenarioPack
  overallScore: number
  perStationScores: Record<BridgeCrewRole, number>
  failingScenarios: string[]
  scenarioResults: BridgeCrewScenarioResult[]
  generatedAt: string
  sampleSize: number
}
