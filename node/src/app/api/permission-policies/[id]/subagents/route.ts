import { NextRequest, NextResponse } from "next/server"
import {
  getPermissionPolicyById,
  listPolicySubagentAssignmentsForOwner,
  PermissionPolicyError,
  replacePolicySubagentAssignmentsForOwner,
} from "@/lib/execution/permission-policies"
import { AccessControlError, requireAccessActor } from "@/lib/security/access-control"

export const dynamic = "force-dynamic"

function canAccessPolicy(args: {
  actor: { isAdmin: boolean; userId: string }
  policy: { isSystem: boolean; ownerUserId: string | null }
}): boolean {
  if (args.actor.isAdmin) {
    return true
  }

  if (args.policy.isSystem) {
    return true
  }

  return args.policy.ownerUserId === args.actor.userId
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireAccessActor()

    const { id } = await params
    const policy = await getPermissionPolicyById(id)
    if (!policy || !canAccessPolicy({ actor, policy })) {
      return NextResponse.json({ error: "Permission policy not found" }, { status: 404 })
    }

    const assignments = await listPolicySubagentAssignmentsForOwner({
      policyId: id,
      ownerUserId: actor.userId,
    })

    return NextResponse.json(assignments)
  } catch (error) {
    if (error instanceof AccessControlError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    if (error instanceof PermissionPolicyError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    console.error("Error fetching permission policy subagent assignments:", error)
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
    const policy = await getPermissionPolicyById(id)
    if (!policy || !canAccessPolicy({ actor, policy })) {
      return NextResponse.json({ error: "Permission policy not found" }, { status: 404 })
    }

    const body = await request.json().catch(() => ({}))
    const assignments = await replacePolicySubagentAssignmentsForOwner({
      policyId: id,
      ownerUserId: actor.userId,
      subagentIds: body?.subagentIds,
    })

    return NextResponse.json(assignments)
  } catch (error) {
    if (error instanceof AccessControlError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    if (error instanceof PermissionPolicyError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    console.error("Error replacing permission policy subagent assignments:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
