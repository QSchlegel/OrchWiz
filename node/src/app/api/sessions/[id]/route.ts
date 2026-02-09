import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { headers } from "next/headers"
import { publishRealtimeEvent } from "@/lib/realtime/events"

export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    const dbSession = await prisma.session.findFirst({
      where: {
        id,
        userId: session.user.id,
      },
      include: {
        interactions: {
          orderBy: {
            timestamp: "asc",
          },
        },
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true,
          },
        },
        parentSession: {
          select: {
            id: true,
            title: true,
          },
        },
        _count: {
          select: {
            childSessions: true,
          },
        },
      },
    })

    if (!dbSession) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 })
    }

    return NextResponse.json(dbSession)
  } catch (error) {
    console.error("Error fetching session:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    const body = await request.json()
    const {
      title,
      description,
      status,
      mode,
      projectName,
      branch,
      environment,
      metadata,
    } = body

    const updateData: any = {}
    if (title !== undefined) updateData.title = title
    if (description !== undefined) updateData.description = description
    if (status !== undefined) updateData.status = status
    if (mode !== undefined) updateData.mode = mode
    if (projectName !== undefined) updateData.projectName = projectName
    if (branch !== undefined) updateData.branch = branch
    if (environment !== undefined) updateData.environment = environment
    if (metadata !== undefined) updateData.metadata = metadata

    if (status === "completed") {
      updateData.completedAt = new Date()
    }

    const updatedSession = await prisma.session.update({
      where: {
        id,
        userId: session.user.id,
      },
      data: updateData,
    })

    publishRealtimeEvent({
      type: "session.prompted",
      payload: {
        sessionId: updatedSession.id,
        status: updatedSession.status,
      },
    })

    return NextResponse.json(updatedSession)
  } catch (error) {
    console.error("Error updating session:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    await prisma.session.delete({
      where: {
        id,
        userId: session.user.id,
      },
    })

    publishRealtimeEvent({
      type: "session.prompted",
      payload: {
        sessionId: id,
        status: "deleted",
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting session:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
