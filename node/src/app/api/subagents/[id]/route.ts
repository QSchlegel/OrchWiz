import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { publishNotificationUpdated } from "@/lib/realtime/notifications"
import {
  personalDetailChannelForSubagent,
  personalTopChannelForSubagent,
} from "@/lib/realtime/notification-routing"
import { mergeSubagentSettings, normalizeSubagentSettings } from "@/lib/subagents/settings"
import { normalizeSubagentType, parseSubagentType } from "@/lib/subagents/types"
import type { NotificationChannel } from "@/lib/types/notifications"
import {
  AccessControlError,
  assertCanReadOwnedResource,
  assertCanWriteOwnedResource,
  requireAccessActor,
} from "@/lib/security/access-control"

export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requireAccessActor()

    const { id } = await params
    const subagent = await prisma.subagent.findUnique({
      where: { id },
    })

    if (!subagent) {
      return NextResponse.json({ error: "Subagent not found" }, { status: 404 })
    }

    assertCanReadOwnedResource({
      actor,
      ownerUserId: subagent.ownerUserId,
      isShared: subagent.isShared,
      allowSharedRead: true,
      notFoundMessage: "Subagent not found",
    })

    return NextResponse.json({
      ...subagent,
      subagentType: normalizeSubagentType(subagent.subagentType),
      settings: normalizeSubagentSettings(subagent.settings),
    })
  } catch (error) {
    if (error instanceof AccessControlError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    console.error("Error fetching subagent:", error)
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
    const body = await request.json()
    const { name, description, content, path, settings, isShared, teamId, subagentType } = body
    const parsedSubagentType = parseSubagentType(subagentType)
    if (subagentType !== undefined && !parsedSubagentType) {
      return NextResponse.json(
        { error: "subagentType must be one of: general, bridge_crew, exocomp" },
        { status: 400 },
      )
    }

    const existing = await prisma.subagent.findUnique({
      where: { id },
      select: {
        id: true,
        settings: true,
        ownerUserId: true,
      },
    })
    if (!existing) {
      return NextResponse.json({ error: "Subagent not found" }, { status: 404 })
    }

    assertCanWriteOwnedResource({
      actor,
      ownerUserId: existing.ownerUserId,
      notFoundMessage: "Subagent not found",
    })

    const updateData: any = {}
    if (name !== undefined) updateData.name = name
    if (description !== undefined) updateData.description = description
    if (content !== undefined) updateData.content = content
    if (path !== undefined) updateData.path = path
    if (settings !== undefined) {
      updateData.settings = mergeSubagentSettings(existing.settings, settings)
    }
    if (subagentType !== undefined) updateData.subagentType = parsedSubagentType
    if (isShared !== undefined) updateData.isShared = isShared
    if (teamId !== undefined) updateData.teamId = teamId

    const subagent = await prisma.subagent.update({
      where: { id },
      data: updateData,
    })

    const channels = new Set<NotificationChannel>()
    if (settings && typeof settings === "object" && !Array.isArray(settings)) {
      if (Object.prototype.hasOwnProperty.call(settings, "orchestration")) {
        channels.add(personalDetailChannelForSubagent(subagent.isShared, "orchestration"))
      }
      if (Object.prototype.hasOwnProperty.call(settings, "workspace")) {
        channels.add(personalDetailChannelForSubagent(subagent.isShared, "workspace"))
      }
      if (Object.prototype.hasOwnProperty.call(settings, "memory")) {
        channels.add(personalDetailChannelForSubagent(subagent.isShared, "memory"))
      }
      if (Object.prototype.hasOwnProperty.call(settings, "guidelines")) {
        channels.add(personalDetailChannelForSubagent(subagent.isShared, "guidelines"))
      }
      if (Object.prototype.hasOwnProperty.call(settings, "capabilities")) {
        channels.add(personalDetailChannelForSubagent(subagent.isShared, "capabilities"))
      }
    }

    if (channels.size === 0) {
      channels.add(personalTopChannelForSubagent(subagent.isShared))
    }

    for (const channel of channels) {
      publishNotificationUpdated({
        userId: subagent.ownerUserId || actor.userId,
        channel,
        entityId: subagent.id,
      })
    }

    return NextResponse.json({
      ...subagent,
      subagentType: normalizeSubagentType(subagent.subagentType),
      settings: normalizeSubagentSettings(subagent.settings),
    })
  } catch (error) {
    if (error instanceof AccessControlError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    console.error("Error updating subagent:", error)
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
    const existing = await prisma.subagent.findUnique({
      where: { id },
      select: {
        id: true,
        ownerUserId: true,
        isShared: true,
      },
    })
    if (!existing) {
      return NextResponse.json({ error: "Subagent not found" }, { status: 404 })
    }

    assertCanWriteOwnedResource({
      actor,
      ownerUserId: existing.ownerUserId,
      notFoundMessage: "Subagent not found",
    })

    await prisma.subagent.delete({
      where: { id },
    })

    publishNotificationUpdated({
      userId: existing.ownerUserId || actor.userId,
      channel: personalTopChannelForSubagent(existing.isShared),
      entityId: existing.id,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof AccessControlError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    console.error("Error deleting subagent:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
