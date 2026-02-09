import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { headers } from "next/headers"
import { mapForwardedVerification } from "@/lib/forwarding/projections"
import { publishRealtimeEvent } from "@/lib/realtime/events"

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

    const runs = await prisma.verificationRun.findMany({
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
        startedAt: "desc",
      },
      take: 100,
    })

    if (!includeForwarded) {
      return NextResponse.json(runs)
    }

    const forwardedEvents = await prisma.forwardingEvent.findMany({
      where: {
        eventType: "verification",
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

    const forwardedRuns = forwardedEvents.map(mapForwardedVerification)
    const combined = [...runs, ...forwardedRuns].sort((a: any, b: any) => {
      const aDate = new Date(a.startedAt || a.forwardingOccurredAt || 0).getTime()
      const bDate = new Date(b.startedAt || b.forwardingOccurredAt || 0).getTime()
      return bDate - aDate
    })

    return NextResponse.json(combined)
  } catch (error) {
    console.error("Error fetching verification runs:", error)
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
      sessionId,
      type,
      status,
      result,
      iterations,
      feedback,
      completedAt,
    } = body

    if (!sessionId || !type) {
      return NextResponse.json(
        { error: "sessionId and type are required" },
        { status: 400 }
      )
    }

    const linkedSession = await prisma.session.findFirst({
      where: {
        id: sessionId,
        userId: session.user.id,
      },
      select: {
        id: true,
      },
    })

    if (!linkedSession) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 })
    }

    const run = await prisma.verificationRun.create({
      data: {
        sessionId,
        type,
        status: status ?? "running",
        result: result ?? {},
        iterations: iterations ?? 0,
        feedback: feedback ?? null,
        completedAt: completedAt ? new Date(completedAt) : null,
      },
      include: {
        session: {
          select: {
            id: true,
            title: true,
          },
        },
      },
    })

    publishRealtimeEvent({
      type: "verification.updated",
      payload: {
        runId: run.id,
        sessionId: run.sessionId,
        status: run.status,
      },
    })

    return NextResponse.json(run, { status: 201 })
  } catch (error) {
    console.error("Error creating verification run:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
