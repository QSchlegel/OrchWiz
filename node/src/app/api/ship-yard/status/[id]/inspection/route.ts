import { NextRequest, NextResponse } from "next/server"
import type {
  BridgeConnectionProvider,
  BridgeCrewRole,
  BridgeCrewStatus,
  BridgeDispatchSource,
  BridgeDispatchStatus,
  DeploymentProfile,
  DeploymentStatus,
  NodeType,
  ProvisioningMode,
} from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { AccessControlError } from "@/lib/security/access-control"
import { BRIDGE_CREW_ROLE_ORDER } from "@/lib/shipyard/bridge-crew"
import {
  buildBridgeInspectionSummary,
  buildDeliveryMessagePreview,
  extractInspectionFailureFromMetadata,
  extractInspectionLogTailsFromMetadata,
} from "@/lib/shipyard/inspection"
import {
  inspectLocalShipRuntime,
  type LocalRuntimeSnapshot,
} from "@/lib/shipyard/local-runtime"
import {
  requireShipyardRequestActor,
  type ShipyardRequestActor,
} from "@/lib/shipyard/request-actor"

export const dynamic = "force-dynamic"

const DEFAULT_DELIVERIES_TAKE = 10
const MIN_DELIVERIES_TAKE = 1
const MAX_DELIVERIES_TAKE = 50

export interface ShipyardInspectionDeploymentRecord {
  id: string
  name: string
  status: DeploymentStatus
  nodeId: string
  nodeType: NodeType
  deploymentProfile: DeploymentProfile
  provisioningMode: ProvisioningMode
  healthStatus: string | null
  deployedAt: Date | null
  lastHealthCheck: Date | null
  shipVersion: string
  shipVersionUpdatedAt: Date | null
  updatedAt: Date
  metadata: unknown
}

export interface ShipyardInspectionBridgeCrewRecord {
  id: string
  role: BridgeCrewRole
  callsign: string
  name: string
  status: BridgeCrewStatus
}

export interface ShipyardInspectionBridgeConnectionRecord {
  id: string
  provider: BridgeConnectionProvider
  enabled: boolean
  autoRelay: boolean
}

export interface ShipyardInspectionBridgeDeliveryRecord {
  id: string
  connectionId: string
  source: BridgeDispatchSource
  status: BridgeDispatchStatus
  message: string
  attempts: number
  lastError: string | null
  deliveredAt: Date | null
  createdAt: Date
  connection: {
    id: string
    name: string
    provider: BridgeConnectionProvider
    destination: string
  }
}

export interface ShipyardStatusInspectionRouteDeps {
  requireActor: (
    request: NextRequest,
    options?: { allowLegacyTokenAuth?: boolean },
  ) => Promise<ShipyardRequestActor>
  findShip: (args: {
    shipDeploymentId: string
    userId: string
  }) => Promise<ShipyardInspectionDeploymentRecord | null>
  listBridgeCrew: (shipDeploymentId: string) => Promise<ShipyardInspectionBridgeCrewRecord[]>
  listBridgeConnections: (
    shipDeploymentId: string,
  ) => Promise<ShipyardInspectionBridgeConnectionRecord[]>
  listBridgeDeliveries: (args: {
    shipDeploymentId: string
    take: number
  }) => Promise<ShipyardInspectionBridgeDeliveryRecord[]>
  inspectRuntime: () => Promise<LocalRuntimeSnapshot>
  now: () => Date
}

const defaultDeps: ShipyardStatusInspectionRouteDeps = {
  requireActor: (request, options) => requireShipyardRequestActor(request, options),
  findShip: async ({ shipDeploymentId, userId }) =>
    prisma.agentDeployment.findFirst({
      where: {
        id: shipDeploymentId,
        userId,
        deploymentType: "ship",
      },
      select: {
        id: true,
        name: true,
        status: true,
        nodeId: true,
        nodeType: true,
        deploymentProfile: true,
        provisioningMode: true,
        healthStatus: true,
        deployedAt: true,
        lastHealthCheck: true,
        shipVersion: true,
        shipVersionUpdatedAt: true,
        updatedAt: true,
        metadata: true,
      },
    }),
  listBridgeCrew: async (shipDeploymentId) =>
    prisma.bridgeCrew.findMany({
      where: {
        deploymentId: shipDeploymentId,
      },
      select: {
        id: true,
        role: true,
        callsign: true,
        name: true,
        status: true,
      },
    }),
  listBridgeConnections: async (shipDeploymentId) =>
    prisma.bridgeConnection.findMany({
      where: {
        deploymentId: shipDeploymentId,
      },
      select: {
        id: true,
        provider: true,
        enabled: true,
        autoRelay: true,
      },
    }),
  listBridgeDeliveries: async ({ shipDeploymentId, take }) =>
    prisma.bridgeDispatchDelivery.findMany({
      where: {
        deploymentId: shipDeploymentId,
      },
      select: {
        id: true,
        connectionId: true,
        source: true,
        status: true,
        message: true,
        attempts: true,
        lastError: true,
        deliveredAt: true,
        createdAt: true,
        connection: {
          select: {
            id: true,
            name: true,
            provider: true,
            destination: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      take,
    }),
  inspectRuntime: () => inspectLocalShipRuntime(),
  now: () => new Date(),
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {}
  }
  return value as Record<string, unknown>
}

function asRecordOrNull(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null
  }
  return value as Record<string, unknown>
}

function asBooleanOrNull(value: unknown): boolean | null {
  if (typeof value !== "boolean") {
    return null
  }
  return value
}

function parseDeliveriesTake(rawValue: string | null): number {
  const parsed = Number.parseInt(rawValue || "", 10)
  if (!Number.isFinite(parsed)) {
    return DEFAULT_DELIVERIES_TAKE
  }

  return Math.max(MIN_DELIVERIES_TAKE, Math.min(MAX_DELIVERIES_TAKE, parsed))
}

function parseIncludeRuntime(rawValue: string | null): boolean {
  return rawValue === "true"
}

export async function handleGetShipyardStatusInspection(
  request: NextRequest,
  args: { shipDeploymentId: string },
  deps: ShipyardStatusInspectionRouteDeps = defaultDeps,
) {
  try {
    const actor = await deps.requireActor(request, {
      allowLegacyTokenAuth: true,
    })

    const deliveriesTake = parseDeliveriesTake(
      request.nextUrl.searchParams.get("deliveriesTake"),
    )
    const includeRuntime = parseIncludeRuntime(
      request.nextUrl.searchParams.get("includeRuntime"),
    )

    const deployment = await deps.findShip({
      shipDeploymentId: args.shipDeploymentId,
      userId: actor.userId,
    })

    if (!deployment) {
      return NextResponse.json({ error: "Ship not found" }, { status: 404 })
    }

    const [bridgeCrew, bridgeConnections, bridgeDeliveries, runtimeSnapshot] =
      await Promise.all([
        deps.listBridgeCrew(args.shipDeploymentId),
        deps.listBridgeConnections(args.shipDeploymentId),
        deps.listBridgeDeliveries({
          shipDeploymentId: args.shipDeploymentId,
          take: deliveriesTake,
        }),
        includeRuntime ? deps.inspectRuntime() : Promise.resolve(null),
      ])

    const sortedBridgeCrew = [...bridgeCrew].sort(
      (left, right) => BRIDGE_CREW_ROLE_ORDER.indexOf(left.role) - BRIDGE_CREW_ROLE_ORDER.indexOf(right.role),
    )

    const metadata = asRecord(deployment.metadata)
    const failure = extractInspectionFailureFromMetadata({
      metadata,
      deploymentStatus: deployment.status,
    })

    const logs = {
      tails: extractInspectionLogTailsFromMetadata(metadata),
      saneBootstrap: asBooleanOrNull(metadata.saneBootstrap),
      localProvisioning: asRecordOrNull(metadata.localProvisioning),
      openClawContextInjection: asRecordOrNull(metadata.openClawContextInjection),
      shipUpgrade: asRecordOrNull(metadata.shipUpgrade),
    }

    const summary = buildBridgeInspectionSummary({
      connections: bridgeConnections,
      deliveries: bridgeDeliveries.map((delivery) => ({
        createdAt: delivery.createdAt,
        status: delivery.status,
      })),
    })

    const bridgeReadout = {
      summary,
      deliveries: bridgeDeliveries.map((delivery) => ({
        id: delivery.id,
        connectionId: delivery.connectionId,
        connectionName: delivery.connection.name,
        provider: delivery.connection.provider,
        destination: delivery.connection.destination,
        source: delivery.source,
        status: delivery.status,
        attempts: delivery.attempts,
        lastError: delivery.lastError,
        deliveredAt: delivery.deliveredAt ? delivery.deliveredAt.toISOString() : null,
        createdAt: delivery.createdAt.toISOString(),
        messagePreview: buildDeliveryMessagePreview(delivery.message),
      })),
    }

    const responseBody: Record<string, unknown> = {
      checkedAt: deps.now().toISOString(),
      deployment: {
        id: deployment.id,
        name: deployment.name,
        status: deployment.status,
        nodeId: deployment.nodeId,
        nodeType: deployment.nodeType,
        deploymentProfile: deployment.deploymentProfile,
        provisioningMode: deployment.provisioningMode,
        healthStatus: deployment.healthStatus,
        deployedAt: deployment.deployedAt ? deployment.deployedAt.toISOString() : null,
        lastHealthCheck: deployment.lastHealthCheck
          ? deployment.lastHealthCheck.toISOString()
          : null,
        shipVersion: deployment.shipVersion,
        shipVersionUpdatedAt: deployment.shipVersionUpdatedAt
          ? deployment.shipVersionUpdatedAt.toISOString()
          : null,
        updatedAt: deployment.updatedAt.toISOString(),
      },
      failure,
      logs,
      bridgeReadout,
      bridgeCrew: sortedBridgeCrew,
    }

    if (runtimeSnapshot) {
      responseBody.runtime = runtimeSnapshot
    }

    return NextResponse.json(responseBody)
  } catch (error) {
    if (error instanceof AccessControlError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status },
      )
    }

    console.error("Error fetching ship yard status inspection:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  return handleGetShipyardStatusInspection(request, { shipDeploymentId: id })
}
