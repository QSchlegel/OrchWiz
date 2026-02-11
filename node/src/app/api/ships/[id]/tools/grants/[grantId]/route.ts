import { NextRequest, NextResponse } from "next/server"
import { AccessControlError, requireAccessActor, type AccessActor } from "@/lib/security/access-control"
import {
  getShipToolsStateForOwner,
  revokeShipToolGrantForOwner,
  ShipToolsError,
} from "@/lib/tools/requests"

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

function toErrorResponse(error: unknown): NextResponse {
  if (error instanceof AccessControlError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
  }

  if (error instanceof ShipToolsError) {
    return NextResponse.json({ error: error.message }, { status: error.status })
  }

  console.error("Ship tools grant revoke route failed:", error)
  return NextResponse.json({ error: "Internal server error" }, { status: 500 })
}

export async function handleDeleteShipToolGrant(
  _request: NextRequest,
  shipDeploymentId: string,
  grantId: string,
  deps: ShipToolGrantsRouteDeps = defaultDeps,
) {
  try {
    const actor = await deps.requireActor()

    await deps.revokeGrant({
      ownerUserId: actor.userId,
      shipDeploymentId,
      grantId,
    })

    const state = await deps.getState({
      ownerUserId: actor.userId,
      shipDeploymentId,
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
