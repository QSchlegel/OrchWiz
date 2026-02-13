export const QUARTERMASTER_ROLE_KEY = "qtm"
export const QUARTERMASTER_CALLSIGN = "QTM-LGR"
export const QUARTERMASTER_AUTHORITY = "scoped_operator"
export const QUARTERMASTER_RUNTIME_PROFILE = "quartermaster"
export const QUARTERMASTER_DIAGNOSTICS_SCOPE = "read_only"
export const QUARTERMASTER_CHANNEL = "ship-quartermaster"
export const QUARTERMASTER_POLICY_SLUG = "quartermaster-readonly"
export const QUARTERMASTER_FLEET_SCOPE = "fleet"
export const QUARTERMASTER_CONTEXT_TEMPLATE_VERSION = 2
export const QUARTERMASTER_CONTEXT_PATH = ".claude/agents/quartermaster/qtm-lgr/SOUL.md"

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
