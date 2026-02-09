import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

const ROLE_FALLBACK = ["Helm", "Ops", "Science", "Engineering", "Tactical", "Comms"]

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

    const [subagents, tasks, forwardedBridgeEvents, forwardedSystemEvents] = await Promise.all([
      prisma.subagent.findMany({
        where: {
          OR: [{ isShared: true }, { teamId: "uss-k8s" }],
        },
        orderBy: {
          createdAt: "asc",
        },
      }),
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

    const stationBase = subagents.slice(0, ROLE_FALLBACK.length).map((agent, index) => {
      const role = ROLE_FALLBACK[index % ROLE_FALLBACK.length]
      const statusIndex = index % 3
      const status = statusIndex === 0 ? "online" : statusIndex === 1 ? "busy" : "offline"

      return {
        id: agent.id,
        name: agent.name,
        role,
        status,
        load: 35 + (index * 11) % 60,
        focus: agent.description || "Awaiting orders",
        queue: [] as string[],
      }
    })

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

    const stationsWithQueue = stationBase.map((station) => {
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
      for (const event of forwardedBridgeEvents) {
        const payload = (event.payload || {}) as Record<string, unknown>
        const eventStationId = (payload.stationId as string) || `forwarded-${event.id}`
        const existingStation = stationsWithQueue.find((station) => station.id === eventStationId)

        if (existingStation) {
          if (typeof payload.status === "string") {
            existingStation.status = payload.status
          }
          if (typeof payload.load === "number") {
            existingStation.load = payload.load
          }
          if (typeof payload.focus === "string") {
            existingStation.focus = payload.focus
          }
          continue
        }

        stationsWithQueue.push({
          id: eventStationId,
          name:
            (payload.name as string) ||
            `${event.sourceNode.name || event.sourceNode.nodeId} station`,
          role: (payload.role as string) || "Remote",
          status: (payload.status as string) || "online",
          load: typeof payload.load === "number" ? payload.load : 40,
          focus:
            (payload.focus as string) ||
            `Forwarded from ${event.sourceNode.name || event.sourceNode.nodeId}`,
          queue: [],
        })
      }
    }

    return NextResponse.json({
      stations: stationsWithQueue,
      workItems,
      systems,
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
