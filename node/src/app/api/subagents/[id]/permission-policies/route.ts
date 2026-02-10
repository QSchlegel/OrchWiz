import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { publishNotificationUpdated } from "@/lib/realtime/notifications"
import { personalDetailChannelForSubagent } from "@/lib/realtime/notification-routing"
import {
  listSubagentPermissionPolicyAssignments,
  PermissionPolicyError,
  replaceSubagentPermissionPolicyAssignments,
} from "@/lib/execution/permission-policies"
import {
  AccessControlError,
  assertCanReadOwnedResource,
  assertCanWriteOwnedResource,
  requireAccessActor,
} from "@/lib/security/access-control"

export const dynamic = "force-dynamic"

async function loadSubagent(id: string) {
  return prisma.subagent.findUnique({
    where: { id },
    select: {
      id: true,
      isShared: true,
      ownerUserId: true,
    },
  })
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireAccessActor()

    const { id } = await params
    const subagent = await loadSubagent(id)
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

    const assignments = await listSubagentPermissionPolicyAssignments(id)
    return NextResponse.json(assignments)
  } catch (error) {
    if (error instanceof AccessControlError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    if (error instanceof PermissionPolicyError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    console.error("Error fetching subagent permission policy assignments:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireAccessActor()

    const { id } = await params
    const subagent = await loadSubagent(id)
    if (!subagent) {
      return NextResponse.json({ error: "Subagent not found" }, { status: 404 })
    }

    assertCanWriteOwnedResource({
      actor,
      ownerUserId: subagent.ownerUserId,
      notFoundMessage: "Subagent not found",
    })

    if (subagent.isShared) {
      return NextResponse.json(
        { error: "Shared agents are read-only on this page." },
        { status: 403 },
      )
    }

    const body = await request.json().catch(() => ({}))
    const assignments = await replaceSubagentPermissionPolicyAssignments({
      subagentId: id,
      assignments: body?.assignments,
    })

    publishNotificationUpdated({
      userId: subagent.ownerUserId || actor.userId,
      channel: personalDetailChannelForSubagent(subagent.isShared, "permissions"),
      entityId: subagent.id,
    })

    return NextResponse.json(assignments)
  } catch (error) {
    if (error instanceof AccessControlError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    if (error instanceof PermissionPolicyError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    console.error("Error replacing subagent permission policy assignments:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
