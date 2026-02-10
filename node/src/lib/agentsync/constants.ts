import type { BridgeStationKey } from "@/lib/bridge/stations"
import { BRIDGE_CREW_ROLE_ORDER, bridgeCrewTemplateForRole } from "@/lib/shipyard/bridge-crew"

export const AGENTSYNC_MANAGED_BLOCK_BEGIN = "<!-- AGENTSYNC:BEGIN -->"
export const AGENTSYNC_MANAGED_BLOCK_END = "<!-- AGENTSYNC:END -->"

export const AGENTSYNC_LOW_RISK_FILES = [
  "MISSION.md",
  "CONTEXT.md",
  "MEMORY.md",
  "DECISIONS.md",
  "FAILURES.md",
] as const

export const AGENTSYNC_HIGH_RISK_FILES = [
  "SOUL.md",
  "VOICE.md",
  "ETHICS.md",
  "SCOPE.md",
  "AUDIENCE.md",
] as const

const LOW_RISK_FILE_SET = new Set<string>(AGENTSYNC_LOW_RISK_FILES)
const HIGH_RISK_FILE_SET = new Set<string>(AGENTSYNC_HIGH_RISK_FILES)
const MANAGED_FILE_NAME_LOOKUP = new Map<string, string>(
  [...AGENTSYNC_LOW_RISK_FILES, ...AGENTSYNC_HIGH_RISK_FILES].map((fileName) => [fileName.toUpperCase(), fileName]),
)

const STATION_TO_CALLSIGN = new Map<BridgeStationKey, string>(
  BRIDGE_CREW_ROLE_ORDER.map((role) => [role, bridgeCrewTemplateForRole(role).callsign]),
)

function envFlag(name: string, defaultValue: boolean): boolean {
  const raw = process.env[name]
  if (!raw) {
    return defaultValue
  }

  const normalized = raw.trim().toLowerCase()
  if (normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on") {
    return true
  }
  if (normalized === "0" || normalized === "false" || normalized === "no" || normalized === "off") {
    return false
  }

  return defaultValue
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)))
}

export const ELIGIBLE_BRIDGE_CREW_CALLSIGNS = BRIDGE_CREW_ROLE_ORDER.map((role) =>
  bridgeCrewTemplateForRole(role).callsign,
)

const ELIGIBLE_BRIDGE_CREW_CALLSIGN_SET = new Set(
  ELIGIBLE_BRIDGE_CREW_CALLSIGNS.map((callsign) => callsign.toUpperCase()),
)

export function normalizeAgentSyncFileName(fileName: string): string {
  const trimmed = fileName.trim()
  if (!trimmed) {
    return trimmed
  }

  return MANAGED_FILE_NAME_LOOKUP.get(trimmed.toUpperCase()) || trimmed
}

export function isLowRiskAgentSyncFileName(fileName: string): boolean {
  return LOW_RISK_FILE_SET.has(normalizeAgentSyncFileName(fileName))
}

export function isHighRiskAgentSyncFileName(fileName: string): boolean {
  return HIGH_RISK_FILE_SET.has(normalizeAgentSyncFileName(fileName))
}

export function isAgentSyncManagedFile(fileName: string): boolean {
  return isLowRiskAgentSyncFileName(fileName) || isHighRiskAgentSyncFileName(fileName)
}

export function isEligibleBridgeCrewCallsign(name: string | null | undefined): boolean {
  if (!name) {
    return false
  }
  return ELIGIBLE_BRIDGE_CREW_CALLSIGN_SET.has(name.trim().toUpperCase())
}

export function stationKeyToBridgeCrewCallsign(stationKey: BridgeStationKey): string {
  return STATION_TO_CALLSIGN.get(stationKey) || stationKey.toUpperCase()
}

export function agentSyncEnabled(): boolean {
  return envFlag("AGENTSYNC_ENABLED", true)
}

export function agentSyncLookbackDays(): number {
  const parsed = Number.parseInt(process.env.AGENTSYNC_LOOKBACK_DAYS || "14", 10)
  if (!Number.isFinite(parsed)) {
    return 14
  }
  return clampInteger(parsed, 1, 60)
}

export function agentSyncMinSignals(): number {
  const parsed = Number.parseInt(process.env.AGENTSYNC_MIN_SIGNALS || "3", 10)
  if (!Number.isFinite(parsed)) {
    return 3
  }
  return clampInteger(parsed, 1, 100)
}

export function agentSyncCronToken(): string | null {
  const token = process.env.AGENTSYNC_CRON_TOKEN
  if (!token) {
    return null
  }

  const trimmed = token.trim()
  return trimmed.length > 0 ? trimmed : null
}

export function defaultAgentSyncNightlyHour(): number {
  return 2
}
