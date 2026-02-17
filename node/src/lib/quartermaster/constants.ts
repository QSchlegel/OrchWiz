export const QUARTERMASTER_ROLE_KEY = "qtm"
export const QUARTERMASTER_CALLSIGN = "QTM-LGR"
export const QUARTERMASTER_RUNTIME_PROFILE = "quartermaster"
export const QUARTERMASTER_CHANNEL = "ship-quartermaster"
export const QUARTERMASTER_FLEET_SCOPE = "fleet"
export const QUARTERMASTER_CONTEXT_TEMPLATE_VERSION = 3
export const QUARTERMASTER_CONTEXT_PATH = ".claude/agents/quartermaster/qtm-lgr/SOUL.md"

export const QUARTERMASTER_EXECUTION_LEVELS = [
  "read_only",
  "workspace_write",
  "danger_full_access",
] as const
export type QuartermasterExecutionLevel = (typeof QUARTERMASTER_EXECUTION_LEVELS)[number]

export interface QuartermasterLoopDefaults {
  intervalSeconds: number
  maxDurationSeconds: number
  maxIterations: number
  autoStopOnHealthyActive: boolean
}

export const QUARTERMASTER_LOOP_DEFAULTS: QuartermasterLoopDefaults = {
  intervalSeconds: 60,
  maxDurationSeconds: 30 * 60,
  maxIterations: 30,
  autoStopOnHealthyActive: true,
}

export const QUARTERMASTER_POLICY_SLUG_READONLY = "quartermaster-readonly"
export const QUARTERMASTER_POLICY_SLUG_WORKSPACE = "quartermaster-executive-workspace"
export const QUARTERMASTER_POLICY_SLUG_FULL = "quartermaster-executive-full"
export const QUARTERMASTER_POLICY_SLUG = QUARTERMASTER_POLICY_SLUG_READONLY

export function isQuartermasterExecutionLevel(value: unknown): value is QuartermasterExecutionLevel {
  return typeof value === "string" && QUARTERMASTER_EXECUTION_LEVELS.includes(value as QuartermasterExecutionLevel)
}

export function parseQuartermasterExecutionLevel(
  value: unknown,
  fallback: QuartermasterExecutionLevel = "read_only",
): QuartermasterExecutionLevel {
  return isQuartermasterExecutionLevel(value) ? value : fallback
}

export function quartermasterPolicySlugForExecutionLevel(level: QuartermasterExecutionLevel): string {
  if (level === "danger_full_access") {
    return QUARTERMASTER_POLICY_SLUG_FULL
  }
  if (level === "workspace_write") {
    return QUARTERMASTER_POLICY_SLUG_WORKSPACE
  }
  return QUARTERMASTER_POLICY_SLUG_READONLY
}

export function quartermasterAuthorityForExecutionLevel(level: QuartermasterExecutionLevel): string {
  if (level === "danger_full_access") {
    return "executive_operator"
  }
  return "scoped_operator"
}

export function quartermasterDiagnosticsScopeForExecutionLevel(
  level: QuartermasterExecutionLevel,
): QuartermasterExecutionLevel {
  return level
}

export const QUARTERMASTER_AUTHORITY = quartermasterAuthorityForExecutionLevel("read_only")
export const QUARTERMASTER_DIAGNOSTICS_SCOPE = quartermasterDiagnosticsScopeForExecutionLevel("read_only")

export function quartermasterSubagentName(shipDeploymentId: string): string {
  return `${QUARTERMASTER_CALLSIGN}:${shipDeploymentId}`
}

export function quartermasterSessionTitle(shipName: string): string {
  const normalizedShipName = shipName.trim() || "Unnamed Ship"
  return `${QUARTERMASTER_CALLSIGN} · ${normalizedShipName}`
}

export function quartermasterFleetSubagentName(): string {
  return `${QUARTERMASTER_CALLSIGN}:${QUARTERMASTER_FLEET_SCOPE}`
}

export function quartermasterFleetSessionTitle(): string {
  return `${QUARTERMASTER_CALLSIGN} · Fleet`
}
