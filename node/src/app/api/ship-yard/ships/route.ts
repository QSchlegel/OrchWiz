import { NextRequest, NextResponse } from "next/server"
import type { DeploymentProfile } from "@/lib/deployment/profile"
import { prisma } from "@/lib/prisma"
import { publishNotificationUpdated } from "@/lib/realtime/notifications"
import { AccessControlError } from "@/lib/security/access-control"
import { publishShipUpdated } from "@/lib/shipyard/events"
import {
  isShipyardManagedDeployment,
  queueShipyardInfraTeardown,
} from "@/lib/shipyard/infra-teardown"
import {
  requireShipyardRequestActor,
  type ShipyardRequestActor,
} from "@/lib/shipyard/request-actor"

export const dynamic = "force-dynamic"

interface ShipRecord {
  id: string
  nodeId: string
  deploymentProfile: DeploymentProfile
  config: unknown
  metadata: unknown
}

interface DeleteShipsFilter {
  namePrefix?: string
  deploymentProfile?: DeploymentProfile
}

export interface ShipyardShipsRouteDeps {
  requireActor: (request: NextRequest) => Promise<ShipyardRequestActor>
  listShips: (userId: string, filter: DeleteShipsFilter) => Promise<ShipRecord[]>
  deleteShipsByIds: (userId: string, shipIds: string[]) => Promise<number>
  publishShipUpdateEvent: typeof publishShipUpdated
  publishNotificationUpdate: typeof publishNotificationUpdated
  queueInfraTeardown: typeof queueShipyardInfraTeardown
}

const defaultDeps: ShipyardShipsRouteDeps = {
  requireActor: async (request) => requireShipyardRequestActor(request),
  listShips: async (userId, filter) =>
    prisma.agentDeployment.findMany({
      where: {
        userId,
        deploymentType: "ship",
        ...(filter.namePrefix
          ? {
              name: {
                startsWith: filter.namePrefix,
              },
            }
          : {}),
        ...(filter.deploymentProfile
          ? {
              deploymentProfile: filter.deploymentProfile,
            }
          : {}),
      },
      select: {
        id: true,
        nodeId: true,
        deploymentProfile: true,
        config: true,
        metadata: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    }),
  deleteShipsByIds: async (userId, shipIds) => {
    if (shipIds.length === 0) {
      return 0
    }

    const deleted = await prisma.agentDeployment.deleteMany({
      where: {
        userId,
        deploymentType: "ship",
        id: {
          in: shipIds,
        },
      },
    })

    return deleted.count
  },
  publishShipUpdateEvent: publishShipUpdated,
  publishNotificationUpdate: publishNotificationUpdated,
  queueInfraTeardown: queueShipyardInfraTeardown,
}

const DEPLOYMENT_PROFILE_VALUES = new Set<DeploymentProfile>([
  "local_starship_build",
  "lightweight_shuttle",
  "cloud_shipyard",
])

function asNonEmptyString(value: string | null): string | undefined {
  if (typeof value !== "string") {
    return undefined
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function parseDeleteShipsFilter(url: URL): { ok: true; value: DeleteShipsFilter } | { ok: false; error: string } {
  const profileRaw = asNonEmptyString(url.searchParams.get("deploymentProfile"))
  const namePrefix = asNonEmptyString(url.searchParams.get("namePrefix"))

  if (!profileRaw) {
    return {
      ok: true,
      value: {
        ...(namePrefix ? { namePrefix } : {}),
      },
    }
  }

  if (!DEPLOYMENT_PROFILE_VALUES.has(profileRaw as DeploymentProfile)) {
    return {
      ok: false,
      error: "deploymentProfile must be one of: local_starship_build, lightweight_shuttle, cloud_shipyard",
    }
  }

  return {
    ok: true,
    value: {
      ...(namePrefix ? { namePrefix } : {}),
      deploymentProfile: profileRaw as DeploymentProfile,
    },
  }
}

function requireDeleteAllConfirmation(url: URL): string | null {
  const confirmation = asNonEmptyString(url.searchParams.get("confirm"))
  if (confirmation === "delete-all") {
    return null
  }

  return "Bulk delete requires `confirm=delete-all` query parameter."
}

export async function handleDeleteShipyardShips(
  request: NextRequest,
  deps: ShipyardShipsRouteDeps = defaultDeps,
) {
  try {
    const url = new URL(request.url)
    const actor = await deps.requireActor(request)
    const preserveInfra = url.searchParams.get("preserveInfra") === "true"
    const confirmationError = requireDeleteAllConfirmation(url)
    if (confirmationError) {
      return NextResponse.json({ error: confirmationError }, { status: 400 })
    }

    const parsedFilter = parseDeleteShipsFilter(url)
    if (!parsedFilter.ok) {
      return NextResponse.json({ error: parsedFilter.error }, { status: 400 })
    }

    const ships = await deps.listShips(actor.userId, parsedFilter.value)
    const matchedCount = ships.length
    const shipIds = ships.map((ship) => ship.id)

    // Fetch tunnels before deleting ships so teardown can stop them (deploymentId is SetNull on ship delete).
    const tunnelsByDeploymentId = await prisma.shipyardSshTunnel
      .findMany({
        where: {
          userId: actor.userId,
          deploymentId: { in: shipIds },
        },
        select: {
          id: true,
          pid: true,
          pidFile: true,
          deploymentId: true,
        },
      })
      .then((rows) => {
        const map = new Map<string, Array<{ id: string; pid: number | null; pidFile: string | null }>>()
        for (const row of rows) {
          const depId = row.deploymentId
          if (!depId) continue
          let list = map.get(depId)
          if (!list) {
            list = []
            map.set(depId, list)
          }
          list.push({ id: row.id, pid: row.pid, pidFile: row.pidFile })
        }
        return map
      })

    const deletedCount = await deps.deleteShipsByIds(actor.userId, shipIds)

    for (const ship of ships) {
      deps.publishShipUpdateEvent({
        shipId: ship.id,
        status: "deleted",
        nodeId: ship.nodeId,
        userId: actor.userId,
      })
    }

    deps.publishNotificationUpdate({
      userId: actor.userId,
      channel: "ships",
      action: "clear",
    })

    const infraTeardownQueuedShipIds: string[] = []
    if (!preserveInfra) {
      const teardownPromises: Promise<void>[] = []
      for (const ship of ships) {
        if (!isShipyardManagedDeployment(ship.metadata)) {
          continue
        }

        infraTeardownQueuedShipIds.push(ship.id)
        teardownPromises.push(
          deps.queueInfraTeardown({
            shipId: ship.id,
            userId: actor.userId,
            deploymentProfile: ship.deploymentProfile,
            config: ship.config,
            metadata: ship.metadata,
            shipyardSshTunnels: tunnelsByDeploymentId.get(ship.id),
          }),
        )
      }
      await Promise.allSettled(teardownPromises)
    }

    return NextResponse.json({
      matchedCount,
      deletedCount,
      deletedShipIds: ships.map((ship) => ship.id),
      infraTeardownQueuedCount: infraTeardownQueuedShipIds.length,
      infraTeardownQueuedShipIds,
    })
  } catch (error) {
    if (error instanceof AccessControlError) {
      return NextResponse.json(
        {
          error: error.message,
          code: error.code,
        },
        { status: error.status },
      )
    }

    console.error("Error deleting Ship Yard ships:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  return handleDeleteShipyardShips(request)
}
