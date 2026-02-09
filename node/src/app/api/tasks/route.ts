import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { headers } from "next/headers"
import { mapForwardedTask } from "@/lib/forwarding/projections"
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
    if (status) {
      where.status = status
    }

    const tasks = await prisma.task.findMany({
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
      return NextResponse.json(tasks)
    }

    const forwardedEvents = await prisma.forwardingEvent.findMany({
      where: {
        eventType: "task",
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

    const forwardedTasks = forwardedEvents.map(mapForwardedTask)
    const combined = [...tasks, ...forwardedTasks].sort((a: any, b: any) => {
      const aDate = new Date(a.startedAt || a.forwardingOccurredAt || 0).getTime()
      const bDate = new Date(b.startedAt || b.forwardingOccurredAt || 0).getTime()
      return bDate - aDate
    })

    return NextResponse.json(combined)
  } catch (error) {
    console.error("Error fetching tasks:", error)
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
      name,
      status = "running",
      duration,
      tokenCount,
      strategy,
      permissionMode,
      metadata,
      completedAt,
    } = body

    if (!sessionId || !name) {
      return NextResponse.json(
        { error: "sessionId and name are required" },
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

    const task = await prisma.task.create({
      data: {
        sessionId,
        name,
        status,
        duration: duration ?? null,
        tokenCount: tokenCount ?? null,
        strategy: strategy ?? null,
        permissionMode: permissionMode ?? null,
        metadata: metadata ?? {},
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
      type: "task.updated",
      payload: {
        taskId: task.id,
        sessionId: task.sessionId,
        status: task.status,
      },
    })

    return NextResponse.json(task, { status: 201 })
  } catch (error) {
    console.error("Error creating task:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
