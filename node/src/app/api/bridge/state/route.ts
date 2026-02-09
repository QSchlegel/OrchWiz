import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { prisma } from "@/lib/prisma"
import {
  applyForwardedBridgeStationEvents,
  buildCanonicalBridgeStations,
} from "@/lib/bridge/stations"

export const dynamic = "force-dynamic"

function asString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null
  }
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function mapTaskStatus(status?: string) {
  switch (status) {
    case "completed":
      return "completed"
    case "failed":
      return "failed"
    case "running":
    case "thinking":
      return "active"
    default:
      return "pending"
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const includeForwarded = request.nextUrl.searchParams.get("includeForwarded") === "true"
    const requestedShipDeploymentId = asString(request.nextUrl.searchParams.get("shipDeploymentId"))

    const availableShips = await prisma.agentDeployment.findMany({
      where: {
        userId: session.user.id,
        deploymentType: "ship",
      },
      select: {
        id: true,
        name: true,
        status: true,
        updatedAt: true,
        nodeId: true,
        nodeType: true,
        deploymentProfile: true,
      },
      orderBy: {
        updatedAt: "desc",
      },
    })

    const requestedShip = requestedShipDeploymentId
      ? availableShips.find((ship) => ship.id === requestedShipDeploymentId)
      : null
    const selectedShip = requestedShip || availableShips.find((ship) => ship.status === "active") || availableShips[0] || null

    const [bridgeCrew, tasks, forwardedBridgeEvents, forwardedSystemEvents] = await Promise.all([
      selectedShip
        ? prisma.bridgeCrew.findMany({
            where: {
              deploymentId: selectedShip.id,
              status: "active",
            },
            orderBy: {
              role: "asc",
            },
          })
        : Promise.resolve([]),
      prisma.task.findMany({
        where: {
          session: {
            userId: session.user.id,
          },
        },
        orderBy: {
          startedAt: "desc",
        },
        take: 36,
      }),
      includeForwarded
        ? prisma.forwardingEvent.findMany({
            where: {
              eventType: "bridge_station",
            },
            include: {
              sourceNode: true,
            },
            orderBy: {
              occurredAt: "desc",
            },
            take: 24,
          })
        : Promise.resolve([]),
      includeForwarded
        ? prisma.forwardingEvent.findMany({
            where: {
              eventType: "system_status",
            },
            include: {
              sourceNode: true,
            },
            orderBy: {
              occurredAt: "desc",
            },
            take: 24,
          })
        : Promise.resolve([]),
    ])

    const stationBase = buildCanonicalBridgeStations(
      bridgeCrew.map((crewMember) => ({
        id: crewMember.id,
        role: crewMember.role,
        callsign: crewMember.callsign,
        name: crewMember.name,
        description: crewMember.description,
      })),
    )

    const workItems = tasks.map((task, index) => {
      const station = stationBase[index % Math.max(stationBase.length, 1)]
      const status = mapTaskStatus(task.status)
      const eta = task.completedAt
        ? "Complete"
        : status === "failed"
          ? "Review"
          : `T+${(index + 1) * 3}m`

      return {
        id: task.id,
        name: task.name,
        status,
        eta,
        assignedTo: station?.id || "",
      }
    })

    let stationsWithQueue = stationBase.map((station) => {
      const queue = workItems
        .filter((item) => item.assignedTo === station.id)
        .map((item) => item.name)

      return {
        ...station,
        queue,
        focus: queue[0] || station.focus,
      }
    })

    const systems = [
      {
        label: "Comms Array",
        state: "warning",
        detail: "Bridge telemetry partial",
      },
      {
        label: "Sensor Grid",
        state: "nominal",
        detail: "Live feed stable",
      },
      {
        label: "Core Systems",
        state: "nominal",
        detail: "Operational",
      },
    ]

    for (const event of forwardedSystemEvents) {
      const payload = (event.payload || {}) as Record<string, unknown>
      systems.push({
        label: (payload.label as string) || `${event.sourceNode.name || event.sourceNode.nodeId} system`,
        state: (payload.state as string) || "warning",
        detail: (payload.detail as string) || `Forwarded from ${event.sourceNode.nodeId}`,
      })
    }

    if (includeForwarded) {
      stationsWithQueue = applyForwardedBridgeStationEvents(stationsWithQueue, forwardedBridgeEvents)
    }

    return NextResponse.json({
      stations: stationsWithQueue,
      workItems,
      systems,
      selectedShipDeploymentId: selectedShip?.id || null,
      availableShips: availableShips.map((ship) => ({
        id: ship.id,
        name: ship.name,
        status: ship.status,
        updatedAt: ship.updatedAt,
        nodeId: ship.nodeId,
        nodeType: ship.nodeType,
        deploymentProfile: ship.deploymentProfile,
      })),
    })
  } catch (error) {
    console.error("Error loading bridge state:", error)
    return NextResponse.json(
      {
        error: "Internal server error",
      },
      { status: 500 }
    )
  }
}
