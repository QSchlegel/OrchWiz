import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { headers } from "next/headers"
import { mapForwardedSession } from "@/lib/forwarding/projections"
import { publishRealtimeEvent } from "@/lib/realtime/events"
import { publishNotificationUpdated } from "@/lib/realtime/notifications"
import { buildSessionWhereFilter, hasBridgeAgentChannel } from "@/lib/sessions/filters"

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const status = searchParams.get("status")
    const mode = searchParams.get("mode")
    const source = searchParams.get("source")
    const bridgeChannel = searchParams.get("bridgeChannel")
    const includeForwarded = searchParams.get("includeForwarded") === "true"
    const sourceNodeId = searchParams.get("sourceNodeId")
    const where = buildSessionWhereFilter({
      userId: session.user.id,
      status,
      mode,
      source,
      bridgeChannel,
    })

    const sessions = await prisma.session.findMany({
      where,
      orderBy: {
        updatedAt: "desc",
      },
      include: {
        _count: {
          select: {
            interactions: true,
          },
        },
      },
    })

    if (!includeForwarded) {
      return NextResponse.json(sessions)
    }

    const forwardedEvents = await prisma.forwardingEvent.findMany({
      where: {
        eventType: "session",
        sourceNode: {
          ownerUserId: session.user.id,
        },
        ...(sourceNodeId
          ? {
              sourceNode: {
                ownerUserId: session.user.id,
                nodeId: sourceNodeId,
              },
            }
          : {}),
      },
      include: {
        sourceNode: true,
      },
      orderBy: {
        occurredAt: "desc",
      },
      take: 100,
    })

    let forwardedSessions = forwardedEvents.map(mapForwardedSession)
    if (bridgeChannel === "agent") {
      forwardedSessions = forwardedSessions.filter((entry) => hasBridgeAgentChannel(entry.metadata))
    }

    const combined = [...sessions, ...forwardedSessions].sort((a: any, b: any) => {
      const aDate = new Date(a.updatedAt || a.forwardingOccurredAt || 0).getTime()
      const bDate = new Date(b.updatedAt || b.forwardingOccurredAt || 0).getTime()
      return bDate - aDate
    })

    return NextResponse.json(combined)
  } catch (error) {
    console.error("Error fetching sessions:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const {
      title,
      description,
      prompt,
      mode = "plan",
      source = "web",
      projectName,
      branch,
      environment,
      parentSessionId,
      metadata,
    } = body

    const newSession = await prisma.session.create({
      data: {
        title,
        description,
        prompt,
        mode,
        source,
        projectName,
        branch,
        environment,
        parentSessionId,
        metadata: metadata || {},
        userId: session.user.id,
        status: "planning",
      },
    })

    publishRealtimeEvent({
      type: "session.prompted",
      userId: session.user.id,
      payload: {
        sessionId: newSession.id,
        status: newSession.status,
      },
    })

    const bridgeChannel =
      metadata && typeof metadata === "object" && !Array.isArray(metadata)
        ? typeof (metadata as { bridge?: { channel?: unknown } }).bridge?.channel === "string"
          ? (metadata as { bridge?: { channel?: string } }).bridge?.channel
          : null
        : null

    if (bridgeChannel === "bridge-agent") {
      publishNotificationUpdated({
        userId: session.user.id,
        channel: "bridge",
        entityId: newSession.id,
      })
    }

    return NextResponse.json(newSession, { status: 201 })
  } catch (error) {
    console.error("Error creating session:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
