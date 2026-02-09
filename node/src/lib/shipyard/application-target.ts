import type {
  AgentDeployment,
  ApplicationDeployment,
  DeploymentProfile,
  DeploymentStatus,
  NodeType,
  Prisma,
  ProvisioningMode,
} from "@prisma/client"
import { prisma } from "@/lib/prisma"
import {
  normalizeDeploymentProfileInput,
  normalizeInfrastructureInConfig,
} from "@/lib/deployment/profile"

export interface ShipSummary {
  id: string
  name: string
  status: DeploymentStatus
  nodeId: string
  nodeType: NodeType
  deploymentProfile: DeploymentProfile
}

type ShipLike = Pick<
  AgentDeployment,
  "id" | "name" | "status" | "nodeId" | "nodeType" | "deploymentProfile"
>

export type ApplicationWithShip = ApplicationDeployment & {
  shipDeployment: ShipLike | null
}

interface ResolveShipInput {
  userId: string
  appName: unknown
  shipDeploymentId?: unknown
  nodeId?: unknown
  nodeType?: unknown
  nodeUrl?: unknown
  deploymentProfile?: unknown
  provisioningMode?: unknown
  advancedNodeTypeOverride?: unknown
  config?: unknown
}

interface ApplicationTargetInput {
  config?: unknown
}

export interface ApplicationTarget {
  shipDeploymentId: string
  nodeId: string
  nodeType: NodeType
  deploymentProfile: DeploymentProfile
  provisioningMode: ProvisioningMode
  nodeUrl: string | null
  config: Record<string, unknown>
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {}
  }
  return value as Record<string, unknown>
}

function inferShipName(appName: unknown, nodeId: string): string {
  const name = asString(appName)
  if (name) {
    return `${name} Ship`
  }
  return `Inferred Ship ${nodeId}`
}

function shipStatusRank(status: DeploymentStatus): number {
  if (status === "active") return 0
  if (status === "deploying") return 1
  if (status === "updating") return 2
  return 3
}

function rankShips(a: AgentDeployment, b: AgentDeployment): number {
  const statusRank = shipStatusRank(a.status) - shipStatusRank(b.status)
  if (statusRank !== 0) {
    return statusRank
  }
  return b.updatedAt.getTime() - a.updatedAt.getTime()
}

function buildInferredShipMetadata(nodeId: string, appName: unknown): Prisma.InputJsonValue {
  return {
    inferred: true,
    inferredFrom: "application_targeting",
    inferredNodeId: nodeId,
    sourceApplicationName: asString(appName),
    inferredAt: new Date().toISOString(),
  }
}

export function toShipSummary(ship: ShipLike | null): ShipSummary | null {
  if (!ship) return null
  return {
    id: ship.id,
    name: ship.name,
    status: ship.status,
    nodeId: ship.nodeId,
    nodeType: ship.nodeType,
    deploymentProfile: ship.deploymentProfile,
  }
}

export function withApplicationShipSummary<
  T extends { shipDeployment: ShipLike | null; shipDeploymentId?: string | null },
>(
  application: T,
) {
  const { shipDeployment, ...rest } = application
  const ship = toShipSummary(shipDeployment)
  return {
    ...rest,
    shipDeploymentId: shipDeployment?.id || application.shipDeploymentId || null,
    ship,
  }
}

export async function resolveShipForApplication(input: ResolveShipInput): Promise<AgentDeployment> {
  const explicitShipId = asString(input.shipDeploymentId)

  if (explicitShipId) {
    const ship = await prisma.agentDeployment.findFirst({
      where: {
        id: explicitShipId,
        userId: input.userId,
        deploymentType: "ship",
      },
    })
    if (!ship) {
      throw new Error("Ship not found")
    }
    return ship
  }

  const nodeId = asString(input.nodeId)
  if (!nodeId) {
    throw new Error("shipDeploymentId or nodeId is required")
  }

  const matchingShips = await prisma.agentDeployment.findMany({
    where: {
      userId: input.userId,
      nodeId,
      deploymentType: "ship",
    },
    orderBy: {
      updatedAt: "desc",
    },
    take: 12,
  })

  if (matchingShips.length > 0) {
    return [...matchingShips].sort(rankShips)[0]
  }

  const normalizedProfile = normalizeDeploymentProfileInput({
    deploymentProfile: input.deploymentProfile,
    provisioningMode: input.provisioningMode,
    nodeType: input.nodeType,
    advancedNodeTypeOverride: input.advancedNodeTypeOverride,
    config: input.config,
  })

  const inferredShip = await prisma.agentDeployment.create({
    data: {
      name: inferShipName(input.appName, nodeId),
      description: "Inferred ship created from application targeting data",
      subagentId: null,
      nodeId,
      nodeType: normalizedProfile.nodeType,
      deploymentType: "ship",
      deploymentProfile: normalizedProfile.deploymentProfile,
      provisioningMode: normalizedProfile.provisioningMode,
      nodeUrl: asString(input.nodeUrl),
      status: "active",
      config: normalizedProfile.config as Prisma.InputJsonValue,
      metadata: buildInferredShipMetadata(nodeId, input.appName),
      deployedAt: new Date(),
      lastHealthCheck: new Date(),
      healthStatus: "healthy",
      userId: input.userId,
    },
  })

  return inferredShip
}

export function buildApplicationTargetFromShip(
  ship: AgentDeployment,
  input: ApplicationTargetInput,
): ApplicationTarget {
  const incomingConfig = asRecord(input.config)
  const { infrastructure } = normalizeInfrastructureInConfig(ship.deploymentProfile, ship.config)
  const { infrastructure: _incomingInfrastructure, ...configWithoutInfrastructure } = incomingConfig

  return {
    shipDeploymentId: ship.id,
    nodeId: ship.nodeId,
    nodeType: ship.nodeType,
    deploymentProfile: ship.deploymentProfile,
    provisioningMode: ship.provisioningMode,
    nodeUrl: ship.nodeUrl,
    config: {
      ...configWithoutInfrastructure,
      infrastructure,
    },
  }
}
