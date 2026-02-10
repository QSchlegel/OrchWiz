import {
  normalizeInfrastructureInConfig,
  type DeploymentProfile,
  type InfrastructureKind,
} from "@/lib/deployment/profile"

export type ShipDeploymentStatus =
  | "pending"
  | "deploying"
  | "active"
  | "inactive"
  | "failed"
  | "updating"

export type ShipHealthState = "healthy" | "unhealthy" | "unknown"

export interface ClusterSummaryShip {
  status: ShipDeploymentStatus
  healthStatus?: string | null
  updatedAt: string
  deployedAt?: string | null
  deploymentProfile: DeploymentProfile
  config?: unknown
}

export interface ClusterStatusCounts {
  pending: number
  deploying: number
  active: number
  inactive: number
  failed: number
  updating: number
}

export interface ClusterHealthCounts {
  healthy: number
  unhealthy: number
  unknown: number
}

export interface ClusterSummaryGroup {
  key: string
  kind: InfrastructureKind
  kubeContext: string
  namespace: string
  shipCount: number
  statusCounts: ClusterStatusCounts
  healthyCount: number
  unhealthyCount: number
  unknownHealthCount: number
  newestUpdatedAt: string | null
  newestDeployedAt: string | null
}

export interface ShipyardClusterSummary {
  totalShips: number
  statusCounts: ClusterStatusCounts
  healthCounts: ClusterHealthCounts
  deployedNowCount: number
  transitioningCount: number
  failedCount: number
  targetedContexts: number
  targetedNamespaces: number
  newestUpdatedAt: string | null
  newestDeployedAt: string | null
  groups: ClusterSummaryGroup[]
}

function createStatusCounts(): ClusterStatusCounts {
  return {
    pending: 0,
    deploying: 0,
    active: 0,
    inactive: 0,
    failed: 0,
    updating: 0,
  }
}

function toUnixMs(value: string | null | undefined): number {
  if (!value) return 0
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function pickNewest(current: string | null, candidate: string | null | undefined): string | null {
  if (!candidate) {
    return current
  }
  if (!current) {
    return candidate
  }
  return toUnixMs(candidate) > toUnixMs(current) ? candidate : current
}

function classifyHealthStatus(value: string | null | undefined): ShipHealthState {
  if (typeof value !== "string" || value.trim().length === 0) {
    return "unknown"
  }

  return value.trim().toLowerCase() === "healthy" ? "healthy" : "unhealthy"
}

export function summarizeShipDeployments(ships: ClusterSummaryShip[]): ShipyardClusterSummary {
  const statusCounts = createStatusCounts()
  const healthCounts: ClusterHealthCounts = {
    healthy: 0,
    unhealthy: 0,
    unknown: 0,
  }
  const contextSet = new Set<string>()
  const namespaceSet = new Set<string>()
  const groups = new Map<string, ClusterSummaryGroup>()

  let deployedNowCount = 0
  let transitioningCount = 0
  let failedCount = 0
  let newestUpdatedAt: string | null = null
  let newestDeployedAt: string | null = null

  for (const ship of ships) {
    const normalizedInfrastructure = normalizeInfrastructureInConfig(
      ship.deploymentProfile,
      ship.config,
    ).infrastructure
    const key = `${normalizedInfrastructure.kind}|${normalizedInfrastructure.kubeContext}|${normalizedInfrastructure.namespace}`

    if (!groups.has(key)) {
      groups.set(key, {
        key,
        kind: normalizedInfrastructure.kind,
        kubeContext: normalizedInfrastructure.kubeContext,
        namespace: normalizedInfrastructure.namespace,
        shipCount: 0,
        statusCounts: createStatusCounts(),
        healthyCount: 0,
        unhealthyCount: 0,
        unknownHealthCount: 0,
        newestUpdatedAt: null,
        newestDeployedAt: null,
      })
    }

    const group = groups.get(key)
    if (!group) {
      continue
    }

    statusCounts[ship.status] += 1
    group.statusCounts[ship.status] += 1
    group.shipCount += 1

    if (ship.status === "active" || ship.status === "updating") {
      deployedNowCount += 1
    }
    if (ship.status === "pending" || ship.status === "deploying") {
      transitioningCount += 1
    }
    if (ship.status === "failed") {
      failedCount += 1
    }

    const healthState = classifyHealthStatus(ship.healthStatus)
    if (healthState === "healthy") {
      healthCounts.healthy += 1
      group.healthyCount += 1
    } else if (healthState === "unhealthy") {
      healthCounts.unhealthy += 1
      group.unhealthyCount += 1
    } else {
      healthCounts.unknown += 1
      group.unknownHealthCount += 1
    }

    newestUpdatedAt = pickNewest(newestUpdatedAt, ship.updatedAt)
    newestDeployedAt = pickNewest(newestDeployedAt, ship.deployedAt || null)
    group.newestUpdatedAt = pickNewest(group.newestUpdatedAt, ship.updatedAt)
    group.newestDeployedAt = pickNewest(group.newestDeployedAt, ship.deployedAt || null)

    contextSet.add(normalizedInfrastructure.kubeContext)
    namespaceSet.add(normalizedInfrastructure.namespace)
  }

  const sortedGroups = Array.from(groups.values()).sort((left, right) => {
    const updatedDelta = toUnixMs(right.newestUpdatedAt) - toUnixMs(left.newestUpdatedAt)
    if (updatedDelta !== 0) {
      return updatedDelta
    }

    const contextCompare = left.kubeContext.localeCompare(right.kubeContext)
    if (contextCompare !== 0) {
      return contextCompare
    }

    const namespaceCompare = left.namespace.localeCompare(right.namespace)
    if (namespaceCompare !== 0) {
      return namespaceCompare
    }

    return left.kind.localeCompare(right.kind)
  })

  return {
    totalShips: ships.length,
    statusCounts,
    healthCounts,
    deployedNowCount,
    transitioningCount,
    failedCount,
    targetedContexts: contextSet.size,
    targetedNamespaces: namespaceSet.size,
    newestUpdatedAt,
    newestDeployedAt,
    groups: sortedGroups,
  }
}
