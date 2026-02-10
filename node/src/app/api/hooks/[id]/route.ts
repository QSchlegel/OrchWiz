import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { publishNotificationUpdated } from "@/lib/realtime/notifications"
import {
  AccessControlError,
  assertCanReadOwnedResource,
  assertCanWriteOwnedResource,
  requireAccessActor,
} from "@/lib/security/access-control"
import { HookValidationError, parseHookUpdateInput } from "@/lib/hooks/validation"

export const dynamic = 'force-dynamic'

function notifyHooksChanged(userId: string, entityId: string) {
  publishNotificationUpdated({
    userId,
    channel: "hooks",
    entityId,
  })
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requireAccessActor()

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

    assertCanReadOwnedResource({
      actor,
      ownerUserId: hook.ownerUserId,
      notFoundMessage: "Hook not found",
    })

    return NextResponse.json(hook)
  } catch (error) {
    if (error instanceof AccessControlError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

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
    const actor = await requireAccessActor()

    const { id } = await params
    const existing = await prisma.hook.findUnique({
      where: { id },
      select: {
        id: true,
        ownerUserId: true,
        type: true,
      },
    })
    if (!existing) {
      return NextResponse.json({ error: "Hook not found" }, { status: 404 })
    }

    assertCanWriteOwnedResource({
      actor,
      ownerUserId: existing.ownerUserId,
      notFoundMessage: "Hook not found",
    })

    const updateData = parseHookUpdateInput(await request.json(), {
      type: existing.type as "command" | "script" | "webhook",
    })

    const hook = await prisma.hook.update({
      where: { id },
      data: updateData as any,
    })

    notifyHooksChanged(actor.userId, hook.id)

    return NextResponse.json(hook)
  } catch (error) {
    if (error instanceof AccessControlError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    if (error instanceof HookValidationError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

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
    const actor = await requireAccessActor()

    const { id } = await params
    const existing = await prisma.hook.findUnique({
      where: { id },
      select: {
        id: true,
        ownerUserId: true,
      },
    })
    if (!existing) {
      return NextResponse.json({ error: "Hook not found" }, { status: 404 })
    }

    assertCanWriteOwnedResource({
      actor,
      ownerUserId: existing.ownerUserId,
      notFoundMessage: "Hook not found",
    })

    await prisma.hook.delete({
      where: { id },
    })

    notifyHooksChanged(actor.userId, id)

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof AccessControlError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    console.error("Error deleting hook:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
