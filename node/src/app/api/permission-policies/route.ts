import { NextRequest, NextResponse } from "next/server"
import {
  createCustomPermissionPolicy,
  listPermissionPolicies,
  PermissionPolicyError,
} from "@/lib/execution/permission-policies"
import { publishNotificationUpdated } from "@/lib/realtime/notifications"
import { AccessControlError, requireAccessActor } from "@/lib/security/access-control"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const actor = await requireAccessActor()

    const policies = await listPermissionPolicies()
    if (actor.isAdmin) {
      return NextResponse.json(policies)
    }

    return NextResponse.json(
      policies.filter((policy) => policy.isSystem || policy.ownerUserId === actor.userId),
    )
  } catch (error) {
    if (error instanceof AccessControlError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    console.error("Error fetching permission policies:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requireAccessActor()

    const body = await request.json()
    const created = await createCustomPermissionPolicy({
      name: body?.name,
      description: body?.description,
      slug: body?.slug,
      rules: body?.rules,
      ownerUserId: actor.userId,
    })

    publishNotificationUpdated({
      userId: actor.userId,
      channel: "skills",
      entityId: created.id,
    })

    return NextResponse.json(created, { status: 201 })
  } catch (error) {
    if (error instanceof AccessControlError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    if (error instanceof PermissionPolicyError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    console.error("Error creating permission policy:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
