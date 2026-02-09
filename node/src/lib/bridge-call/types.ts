import type { BridgeStationKey } from "@/lib/bridge/stations"

export type BridgeCallRoundSource = "operator" | "system"
export type BridgeCallRoundStatus = "pending" | "running" | "completed" | "partial" | "failed"
export type BridgeCallOfficerResultStatus = "success" | "offline" | "failed"

export interface BridgeCallShipSummary {
  id: string
  name: string
  status: "pending" | "deploying" | "active" | "inactive" | "failed" | "updating"
  nodeId: string
  nodeType: "local" | "cloud" | "hybrid"
  deploymentProfile: "local_starship_build" | "cloud_shipyard"
}

export interface BridgeCallStationSummary {
  id: string
  stationKey: BridgeStationKey
  callsign: string
  name: string
  role: string
  status: "online" | "busy" | "offline"
  load: number
  focus: string
  queue: string[]
  bridgeCrewId?: string
  subagentId?: string
  subagentName?: string
  subagentDescription?: string
}

export interface BridgeCallOfficerResultView {
  id: string
  stationKey: BridgeStationKey
  callsign: string
  status: BridgeCallOfficerResultStatus
  wasRetried: boolean
  attemptCount: number
  error?: string | null
  summary?: string | null
  threadId?: string | null
  sessionId?: string | null
  userInteractionId?: string | null
  aiInteractionId?: string | null
  provider?: string | null
  fallbackUsed?: boolean | null
  latencyMs?: number | null
  createdAt: string
}

export interface BridgeCallRoundView {
  id: string
  shipDeploymentId: string | null
  directive: string
  source: BridgeCallRoundSource
  status: BridgeCallRoundStatus
  leadStationKey: BridgeStationKey | null
  summary: string | null
  createdAt: string
  completedAt: string | null
  officerResults: BridgeCallOfficerResultView[]
}

export interface BridgeCallRoundsGetResponse {
  selectedShipDeploymentId: string | null
  availableShips: BridgeCallShipSummary[]
  stations: BridgeCallStationSummary[]
  rounds: BridgeCallRoundView[]
  queue: {
    active: boolean
    pending: number
  }
}

export interface BridgeCallRoundPostRequest {
  directive: string
  shipDeploymentId?: string | null
  source?: BridgeCallRoundSource
}

export interface BridgeCallRoundPostResponse {
  round: BridgeCallRoundView
  queue: {
    active: boolean
    pending: number
  }
}

const STATION_KEYS = new Set<BridgeStationKey>(["xo", "ops", "eng", "sec", "med", "cou"])

export function isBridgeStationKey(value: unknown): value is BridgeStationKey {
  return typeof value === "string" && STATION_KEYS.has(value as BridgeStationKey)
}

export function normalizeBridgeCallRoundSource(value: unknown): BridgeCallRoundSource {
  return value === "system" ? "system" : "operator"
}
