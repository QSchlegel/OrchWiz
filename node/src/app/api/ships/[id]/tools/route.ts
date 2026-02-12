import { NextRequest, NextResponse } from "next/server"
import { AccessControlError, requireAccessActor, type AccessActor } from "@/lib/security/access-control"
import { getShipToolsStateForOwner, ShipToolsError } from "@/lib/tools/requests"

export const dynamic = "force-dynamic"

interface ShipToolsRouteDeps {
  requireActor: () => Promise<AccessActor>
  getState: typeof getShipToolsStateForOwner
}

const defaultDeps: ShipToolsRouteDeps = {
  requireActor: requireAccessActor,
  getState: getShipToolsStateForOwner,
}

function toErrorResponse(error: unknown): NextResponse {
  if (error instanceof AccessControlError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
  }

  if (error instanceof ShipToolsError) {
    return NextResponse.json(
      {
        error: error.message,
        ...(typeof error.code === "string" ? { code: error.code } : {}),
      },
      { status: error.status },
    )
  }

  console.error("Ship tools route failed:", error)
  return NextResponse.json({ error: "Internal server error" }, { status: 500 })
}

export async function handleGetShipTools(
  _request: NextRequest,
  shipDeploymentId: string,
  deps: ShipToolsRouteDeps = defaultDeps,
) {
  try {
    const actor = await deps.requireActor()

    const state = await deps.getState({
      ownerUserId: actor.userId,
      shipDeploymentId,
    })

    return NextResponse.json(state)
  } catch (error) {
    return toErrorResponse(error)
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  return handleGetShipTools(request, id)
}
