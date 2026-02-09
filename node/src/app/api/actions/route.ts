import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { headers } from "next/headers"
import { mapForwardedAction } from "@/lib/forwarding/projections"

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const sessionId = searchParams.get("sessionId")
    const type = searchParams.get("type")
    const status = searchParams.get("status")
    const includeForwarded = searchParams.get("includeForwarded") === "true"
    const sourceNodeId = searchParams.get("sourceNodeId")

    const where: any = {
      session: {
        userId: session.user.id,
      },
    }
    if (sessionId) {
      where.sessionId = sessionId
    }
    if (type) {
      where.type = type
    }
    if (status) {
      where.status = status
    }

    const actions = await prisma.agentAction.findMany({
      where,
      include: {
        session: {
          select: {
            id: true,
            title: true,
          },
        },
      },
      orderBy: {
        timestamp: "desc",
      },
      take: 100,
    })

    if (!includeForwarded) {
      return NextResponse.json(actions)
    }

    const forwardedEvents = await prisma.forwardingEvent.findMany({
      where: {
        eventType: "action",
        ...(sourceNodeId
          ? {
              sourceNode: {
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

    const forwardedActions = forwardedEvents.map(mapForwardedAction)
    const combined = [...actions, ...forwardedActions].sort((a: any, b: any) => {
      const aDate = new Date(a.timestamp || a.forwardingOccurredAt || 0).getTime()
      const bDate = new Date(b.timestamp || b.forwardingOccurredAt || 0).getTime()
      return bDate - aDate
    })

    return NextResponse.json(combined)
  } catch (error) {
    console.error("Error fetching actions:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
