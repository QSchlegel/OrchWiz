import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { headers } from "next/headers"
import { publishNotificationUpdatedMany } from "@/lib/realtime/notifications"

export const dynamic = 'force-dynamic'

async function notifyHooksChanged(entityId: string) {
  const users = await prisma.user.findMany({
    select: {
      id: true,
    },
  })

  publishNotificationUpdatedMany({
    userIds: users.map((user) => user.id),
    channel: "hooks",
    entityId,
  })
}

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
    const hook = await prisma.hook.findUnique({
      where: { id },
      include: {
        executions: {
          orderBy: {
            timestamp: "desc",
          },
          take: 20,
        },
      },
    })

    if (!hook) {
      return NextResponse.json({ error: "Hook not found" }, { status: 404 })
    }

    return NextResponse.json(hook)
  } catch (error) {
    console.error("Error fetching hook:", error)
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
    const { name, matcher, type, command, isActive } = body

    const updateData: any = {}
    if (name !== undefined) updateData.name = name
    if (matcher !== undefined) updateData.matcher = matcher
    if (type !== undefined) updateData.type = type
    if (command !== undefined) updateData.command = command
    if (isActive !== undefined) updateData.isActive = isActive

    const hook = await prisma.hook.update({
      where: { id },
      data: updateData,
    })

    await notifyHooksChanged(hook.id)

    return NextResponse.json(hook)
  } catch (error) {
    console.error("Error updating hook:", error)
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
    await prisma.hook.delete({
      where: { id },
    })

    await notifyHooksChanged(id)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting hook:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
