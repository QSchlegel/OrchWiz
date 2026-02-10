import type { DeploymentProfile } from "@/lib/deployment/profile"
import {
  BRIDGE_CREW_ROLE_ORDER,
  isBridgeCrewRole,
  type BridgeCrewRole,
} from "@/lib/shipyard/bridge-crew"

export const SHIP_BASE_REQUIREMENTS_ESTIMATE_VERSION = "shipyard_base_v1" as const

interface ResourceAmount {
  cpuMillicores: number
  memoryMiB: number
}

export interface ShipBaseRequirementsRoleEstimate extends ResourceAmount {
  role: BridgeCrewRole
}

export interface ShipBaseRequirementsEstimate {
  version: typeof SHIP_BASE_REQUIREMENTS_ESTIMATE_VERSION
  profile: DeploymentProfile
  baseline: ResourceAmount
  crew: {
    roles: ShipBaseRequirementsRoleEstimate[]
    totals: ResourceAmount
  }
  totals: ResourceAmount
}

const PROFILE_BASELINES: Record<DeploymentProfile, ResourceAmount> = {
  local_starship_build: {
    cpuMillicores: 750,
    memoryMiB: 1024,
  },
  cloud_shipyard: {
    cpuMillicores: 1000,
    memoryMiB: 1536,
  },
}

const CREW_ROLE_DELTAS: Record<BridgeCrewRole, ResourceAmount> = {
  xo: { cpuMillicores: 100, memoryMiB: 128 },
  ops: { cpuMillicores: 150, memoryMiB: 192 },
  eng: { cpuMillicores: 150, memoryMiB: 192 },
  sec: { cpuMillicores: 125, memoryMiB: 160 },
  med: { cpuMillicores: 100, memoryMiB: 128 },
  cou: { cpuMillicores: 75, memoryMiB: 96 },
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null
  }
  return value as Record<string, unknown>
}

function isDeploymentProfile(value: unknown): value is DeploymentProfile {
  return value === "local_starship_build" || value === "cloud_shipyard"
}

function addResourceAmounts(base: ResourceAmount, delta: ResourceAmount): ResourceAmount {
  return {
    cpuMillicores: base.cpuMillicores + delta.cpuMillicores,
    memoryMiB: base.memoryMiB + delta.memoryMiB,
  }
}

function resourceAmountsEqual(a: ResourceAmount, b: ResourceAmount): boolean {
  return a.cpuMillicores === b.cpuMillicores && a.memoryMiB === b.memoryMiB
}

function uniqueCrewRoles(input: unknown): BridgeCrewRole[] {
  if (!Array.isArray(input)) {
    return []
  }

  const roleSet = new Set<BridgeCrewRole>()
  for (const entry of input) {
    if (isBridgeCrewRole(entry)) {
      roleSet.add(entry)
    }
  }

  return BRIDGE_CREW_ROLE_ORDER.filter((role) => roleSet.has(role))
}

function parseNonNegativeInteger(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || !Number.isInteger(value)) {
    return null
  }
  return value
}

function parseResourceAmount(value: unknown): ResourceAmount | null {
  const record = asRecord(value)
  if (!record) {
    return null
  }

  const cpuMillicores = parseNonNegativeInteger(record.cpuMillicores)
  const memoryMiB = parseNonNegativeInteger(record.memoryMiB)
  if (cpuMillicores === null || memoryMiB === null) {
    return null
  }

  return {
    cpuMillicores,
    memoryMiB,
  }
}

function parseRoleEstimates(value: unknown): ShipBaseRequirementsRoleEstimate[] | null {
  if (!Array.isArray(value)) {
    return null
  }

  const roles: ShipBaseRequirementsRoleEstimate[] = []
  for (const entry of value) {
    const record = asRecord(entry)
    if (!record || !isBridgeCrewRole(record.role)) {
      return null
    }

    const resource = parseResourceAmount(record)
    if (!resource) {
      return null
    }

    roles.push({
      role: record.role,
      ...resource,
    })
  }

  return roles
}

function trimTrailingZeros(input: string): string {
  return input.replace(/\.0+$/u, "").replace(/(\.\d*?)0+$/u, "$1")
}

export function estimateShipBaseRequirements(input: {
  deploymentProfile: DeploymentProfile
  crewRoles: unknown
}): ShipBaseRequirementsEstimate {
  const baseline = PROFILE_BASELINES[input.deploymentProfile]
  const crewRoleList = uniqueCrewRoles(input.crewRoles)

  const roleBreakdown = crewRoleList.map((role) => ({
    role,
    ...CREW_ROLE_DELTAS[role],
  }))

  const crewTotals = roleBreakdown.reduce<ResourceAmount>(
    (current, roleEstimate) => addResourceAmounts(current, roleEstimate),
    { cpuMillicores: 0, memoryMiB: 0 },
  )
  const totals = addResourceAmounts(baseline, crewTotals)

  return {
    version: SHIP_BASE_REQUIREMENTS_ESTIMATE_VERSION,
    profile: input.deploymentProfile,
    baseline,
    crew: {
      roles: roleBreakdown,
      totals: crewTotals,
    },
    totals,
  }
}

export function readBaseRequirementsEstimate(metadata: unknown): ShipBaseRequirementsEstimate | null {
  const metadataRecord = asRecord(metadata)
  if (!metadataRecord) {
    return null
  }

  const candidate =
    "baseRequirementsEstimate" in metadataRecord
      ? metadataRecord.baseRequirementsEstimate
      : metadataRecord

  const estimate = asRecord(candidate)
  if (!estimate) {
    return null
  }
  if (estimate.version !== SHIP_BASE_REQUIREMENTS_ESTIMATE_VERSION) {
    return null
  }
  if (!isDeploymentProfile(estimate.profile)) {
    return null
  }

  const baseline = parseResourceAmount(estimate.baseline)
  const crew = asRecord(estimate.crew)
  const crewRoles = crew ? parseRoleEstimates(crew.roles) : null
  const crewTotals = crew ? parseResourceAmount(crew.totals) : null
  const totals = parseResourceAmount(estimate.totals)
  if (!baseline || !crew || !crewRoles || !crewTotals || !totals) {
    return null
  }

  const calculatedCrewTotals = crewRoles.reduce<ResourceAmount>(
    (current, roleEstimate) => addResourceAmounts(current, roleEstimate),
    { cpuMillicores: 0, memoryMiB: 0 },
  )
  if (!resourceAmountsEqual(calculatedCrewTotals, crewTotals)) {
    return null
  }

  const calculatedTotals = addResourceAmounts(baseline, crewTotals)
  if (!resourceAmountsEqual(calculatedTotals, totals)) {
    return null
  }

  return {
    version: SHIP_BASE_REQUIREMENTS_ESTIMATE_VERSION,
    profile: estimate.profile,
    baseline,
    crew: {
      roles: crewRoles,
      totals: crewTotals,
    },
    totals,
  }
}

export function formatCpuMillicores(cpuMillicores: number): string {
  if (!Number.isFinite(cpuMillicores)) {
    return "n/a"
  }

  const vCpu = cpuMillicores / 1000
  return `${cpuMillicores}m (${trimTrailingZeros(vCpu.toFixed(2))} vCPU)`
}

export function formatMemoryMiB(memoryMiB: number): string {
  if (!Number.isFinite(memoryMiB)) {
    return "n/a"
  }

  const gibibytes = memoryMiB / 1024
  if (memoryMiB < 1024) {
    return `${memoryMiB}Mi`
  }

  return `${memoryMiB}Mi (${trimTrailingZeros(gibibytes.toFixed(2))} GiB)`
}
