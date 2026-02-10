import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { publishNotificationUpdated } from "@/lib/realtime/notifications"
import { permissionChannelFromScope } from "@/lib/realtime/notification-routing"
import {
  AccessControlError,
  assertCanReadOwnedResource,
  assertCanWriteOwnedResource,
  requireAccessActor,
} from "@/lib/security/access-control"

export const dynamic = 'force-dynamic'

function asPermissionStatus(value: unknown): "allow" | "ask" | "deny" {
  if (value === "ask" || value === "deny") {
    return value
  }
  return "allow"
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requireAccessActor()

    const { id } = await params
    const permission = await prisma.permission.findUnique({
      where: { id },
    })

    if (!permission) {
      return NextResponse.json({ error: "Permission not found" }, { status: 404 })
    }

    assertCanReadOwnedResource({
      actor,
      ownerUserId: permission.ownerUserId,
      isShared: permission.isShared,
      allowSharedRead: true,
      notFoundMessage: "Permission not found",
    })

    return NextResponse.json(permission)
  } catch (error) {
    if (error instanceof AccessControlError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    console.error("Error fetching permission:", error)
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
    const actor = await requireAccessActor()

    const { id } = await params
    const existing = await prisma.permission.findUnique({
      where: { id },
      select: {
        id: true,
        ownerUserId: true,
      },
    })
    if (!existing) {
      return NextResponse.json({ error: "Permission not found" }, { status: 404 })
    }

    assertCanWriteOwnedResource({
      actor,
      ownerUserId: existing.ownerUserId,
      notFoundMessage: "Permission not found",
    })

    const body = await request.json()
    const {
      commandPattern,
      type,
      status,
      scope,
      subagentId,
      sourceFile,
      isShared,
    } = body

    const normalizedSubagentId =
      typeof subagentId === "string" && subagentId.trim().length > 0 ? subagentId.trim() : null

    if (normalizedSubagentId) {
      const subagent = await prisma.subagent.findUnique({
        where: {
          id: normalizedSubagentId,
        },
        select: {
          id: true,
          ownerUserId: true,
        },
      })

      if (!subagent) {
        return NextResponse.json({ error: "subagentId not found" }, { status: 404 })
      }

      assertCanWriteOwnedResource({
        actor,
        ownerUserId: subagent.ownerUserId,
        notFoundMessage: "subagentId not found",
      })
    }

    const updateData: any = {}
    if (commandPattern !== undefined) updateData.commandPattern = commandPattern
    if (type !== undefined) updateData.type = type
    if (status !== undefined) updateData.status = status
    if (scope !== undefined) updateData.scope = scope
    if (sourceFile !== undefined) updateData.sourceFile = sourceFile
    if (isShared !== undefined) updateData.isShared = isShared

    if (scope === "subagent" && !normalizedSubagentId) {
      return NextResponse.json(
        { error: "subagentId is required when scope is subagent" },
        { status: 400 },
      )
    }

    if (scope === "subagent") {
      updateData.subagentId = normalizedSubagentId
    } else if (scope !== undefined) {
      updateData.subagentId = null
    } else if (subagentId !== undefined) {
      updateData.subagentId = normalizedSubagentId
    }

    const permission = await prisma.permission.update({
      where: { id },
      data: updateData,
    })

    let subagentIsShared: boolean | null = null
    if (permission.scope === "subagent" && permission.subagentId) {
      const subagent = await prisma.subagent.findUnique({
        where: { id: permission.subagentId },
        select: { isShared: true },
      })
      subagentIsShared = subagent?.isShared ?? null
    }

    publishNotificationUpdated({
      userId: permission.ownerUserId || actor.userId,
      channel: permissionChannelFromScope({
        scope: permission.scope,
        status: asPermissionStatus(permission.status),
        subagentIsShared,
      }),
      entityId: permission.id,
    })

    return NextResponse.json(permission)
  } catch (error) {
    if (error instanceof AccessControlError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    console.error("Error updating permission:", error)
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
    const actor = await requireAccessActor()

    const { id } = await params
    const existing = await prisma.permission.findUnique({
      where: { id },
      select: {
        id: true,
        ownerUserId: true,
        scope: true,
        status: true,
        subagentId: true,
      },
    })
    if (!existing) {
      return NextResponse.json({ error: "Permission not found" }, { status: 404 })
    }

    assertCanWriteOwnedResource({
      actor,
      ownerUserId: existing.ownerUserId,
      notFoundMessage: "Permission not found",
    })

    let subagentIsShared: boolean | null = null
    if (existing.scope === "subagent" && existing.subagentId) {
      const subagent = await prisma.subagent.findUnique({
        where: { id: existing.subagentId },
        select: { isShared: true },
      })
      subagentIsShared = subagent?.isShared ?? null
    }

    await prisma.permission.delete({
      where: { id },
    })

    publishNotificationUpdated({
      userId: existing.ownerUserId || actor.userId,
      channel: permissionChannelFromScope({
        scope: existing.scope,
        status: asPermissionStatus(existing.status),
        subagentIsShared,
      }),
      entityId: existing.id,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof AccessControlError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    console.error("Error deleting permission:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
