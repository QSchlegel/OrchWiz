import { NextRequest, NextResponse } from "next/server"
import {
  deleteCustomPermissionPolicy,
  getPermissionPolicyById,
  PermissionPolicyError,
  updateCustomPermissionPolicy,
} from "@/lib/execution/permission-policies"
import { publishNotificationUpdated } from "@/lib/realtime/notifications"
import { AccessControlError, requireAccessActor } from "@/lib/security/access-control"

export const dynamic = "force-dynamic"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireAccessActor()

    const { id } = await params
    const policy = await getPermissionPolicyById(id)
    if (!policy) {
      return NextResponse.json({ error: "Permission policy not found" }, { status: 404 })
    }

    if (!actor.isAdmin && !(policy.isSystem || policy.ownerUserId === actor.userId)) {
      return NextResponse.json({ error: "Permission policy not found" }, { status: 404 })
    }

    return NextResponse.json(policy)
  } catch (error) {
    if (error instanceof AccessControlError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    console.error("Error fetching permission policy:", error)
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
    const existing = await getPermissionPolicyById(id)
    if (!existing) {
      return NextResponse.json({ error: "Permission policy not found" }, { status: 404 })
    }
    if (!actor.isAdmin && existing.ownerUserId !== actor.userId) {
      return NextResponse.json({ error: "Permission policy not found" }, { status: 404 })
    }

    const body = await request.json()

    const updated = await updateCustomPermissionPolicy(id, {
      name: body?.name,
      description: body?.description,
      slug: body?.slug,
      rules: body?.rules,
    })

    if (updated.ownerUserId) {
      publishNotificationUpdated({
        userId: updated.ownerUserId,
        channel: "skills",
        entityId: updated.id,
      })
    }

    return NextResponse.json(updated)
  } catch (error) {
    if (error instanceof AccessControlError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    if (error instanceof PermissionPolicyError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    console.error("Error updating permission policy:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireAccessActor()

    const { id } = await params
    const existing = await getPermissionPolicyById(id)
    if (!existing) {
      return NextResponse.json({ error: "Permission policy not found" }, { status: 404 })
    }
    if (!actor.isAdmin && existing.ownerUserId !== actor.userId) {
      return NextResponse.json({ error: "Permission policy not found" }, { status: 404 })
    }

    await deleteCustomPermissionPolicy(id)

    if (existing.ownerUserId) {
      publishNotificationUpdated({
        userId: existing.ownerUserId,
        channel: "skills",
        entityId: existing.id,
      })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof AccessControlError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    if (error instanceof PermissionPolicyError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    console.error("Error deleting permission policy:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
