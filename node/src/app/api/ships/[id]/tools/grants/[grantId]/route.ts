import { NextRequest, NextResponse } from "next/server"
import { AccessControlError, requireAccessActor, type AccessActor } from "@/lib/security/access-control"
import {
  getShipToolsStateForOwner,
  revokeShipToolGrantForOwner,
  ShipToolsError,
} from "@/lib/tools/requests"
import { GovernanceAccessError } from "@/lib/governance/chain-of-command"
import { publishNotificationUpdated } from "@/lib/realtime/notifications"

export const dynamic = "force-dynamic"

interface ShipToolGrantsRouteDeps {
  requireActor: () => Promise<AccessActor>
  revokeGrant: typeof revokeShipToolGrantForOwner
  getState: typeof getShipToolsStateForOwner
}

const defaultDeps: ShipToolGrantsRouteDeps = {
  requireActor: requireAccessActor,
  revokeGrant: revokeShipToolGrantForOwner,
  getState: getShipToolsStateForOwner,
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

  if (error instanceof ShipToolsError) {
    return NextResponse.json({ error: error.message }, { status: error.status })
  }

  if (error instanceof GovernanceAccessError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
  }

  console.error("Ship tools grant revoke route failed:", error)
  return NextResponse.json({ error: "Internal server error" }, { status: 500 })
}

export async function handleDeleteShipToolGrant(
  request: NextRequest,
  shipDeploymentId: string,
  grantId: string,
  deps: ShipToolGrantsRouteDeps = defaultDeps,
) {
  try {
    const actor = await deps.requireActor()
    const body = await request.json().catch(() => ({})) as Record<string, unknown>

    await deps.revokeGrant({
      ownerUserId: actor.userId,
      shipDeploymentId,
      grantId,
      actingBridgeCrewId: asNonEmptyString(body.actingBridgeCrewId),
      revokedByUserId: actor.userId,
      revokeReason: asNonEmptyString(body.revokeReason),
    })

    const state = await deps.getState({
      ownerUserId: actor.userId,
      shipDeploymentId,
    })

    publishNotificationUpdated({
      userId: actor.userId,
      channel: "ship-yard",
      entityId: shipDeploymentId,
    })

    return NextResponse.json({ success: true, state })
  } catch (error) {
    return toErrorResponse(error)
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; grantId: string }> },
) {
  const { id, grantId } = await params
  return handleDeleteShipToolGrant(request, id, grantId)
}
