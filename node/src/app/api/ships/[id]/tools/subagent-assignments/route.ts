import { NextRequest, NextResponse } from "next/server"
import { AccessControlError, requireAccessActor, type AccessActor } from "@/lib/security/access-control"
import { GovernanceAccessError } from "@/lib/governance/chain-of-command"
import {
  BridgeCrewSubagentAssignmentError,
  listBridgeCrewSubagentAssignmentsForShip,
  replaceBridgeCrewSubagentAssignmentsForShip,
} from "@/lib/governance/subagent-assignments"
import { publishNotificationUpdated } from "@/lib/realtime/notifications"

export const dynamic = "force-dynamic"

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {}
  }

  return value as Record<string, unknown>
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function toErrorResponse(error: unknown): NextResponse {
  if (error instanceof AccessControlError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
  }

  if (error instanceof GovernanceAccessError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
  }

  if (error instanceof BridgeCrewSubagentAssignmentError) {
    return NextResponse.json({ error: error.message }, { status: error.status })
  }

  console.error("Ship subagent assignment route failed:", error)
  return NextResponse.json({ error: "Internal server error" }, { status: 500 })
}

interface SubagentAssignmentsRouteDeps {
  requireActor: () => Promise<AccessActor>
  listAssignments: typeof listBridgeCrewSubagentAssignmentsForShip
  replaceAssignments: typeof replaceBridgeCrewSubagentAssignmentsForShip
  publishNotificationUpdated: typeof publishNotificationUpdated
}

const defaultDeps: SubagentAssignmentsRouteDeps = {
  requireActor: requireAccessActor,
  listAssignments: listBridgeCrewSubagentAssignmentsForShip,
  replaceAssignments: replaceBridgeCrewSubagentAssignmentsForShip,
  publishNotificationUpdated,
}

export async function handleGetShipSubagentAssignments(
  _request: NextRequest,
  shipDeploymentId: string,
  deps: SubagentAssignmentsRouteDeps = defaultDeps,
) {
  try {
    const actor = await deps.requireActor()
    const assignments = await deps.listAssignments({
      ownerUserId: actor.userId,
      shipDeploymentId,
    })

    return NextResponse.json({ assignments })
  } catch (error) {
    return toErrorResponse(error)
  }
}

export async function handlePutShipSubagentAssignments(
  request: NextRequest,
  shipDeploymentId: string,
  deps: SubagentAssignmentsRouteDeps = defaultDeps,
) {
  try {
    const actor = await deps.requireActor()
    const body = asRecord(await request.json().catch(() => ({})))

    const assignments = await deps.replaceAssignments({
      ownerUserId: actor.userId,
      shipDeploymentId,
      actingBridgeCrewId: asNonEmptyString(body.actingBridgeCrewId),
      assignedByUserId: actor.userId,
      assignments: body.assignments,
    })

    deps.publishNotificationUpdated({
      userId: actor.userId,
      channel: "ship-yard",
      entityId: shipDeploymentId,
    })

    return NextResponse.json({ assignments })
  } catch (error) {
    return toErrorResponse(error)
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  return handleGetShipSubagentAssignments(request, id)
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  return handlePutShipSubagentAssignments(request, id)
}
