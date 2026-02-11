import { NextRequest, NextResponse } from "next/server"
import { AccessControlError, requireAccessActor, type AccessActor } from "@/lib/security/access-control"
import {
  createShipToolAccessRequestForOwner,
  getShipToolsStateForOwner,
  ShipToolsError,
} from "@/lib/tools/requests"

export const dynamic = "force-dynamic"

interface ShipToolRequestsRouteDeps {
  requireActor: () => Promise<AccessActor>
  createRequest: typeof createShipToolAccessRequestForOwner
  getState: typeof getShipToolsStateForOwner
}

const defaultDeps: ShipToolRequestsRouteDeps = {
  requireActor: requireAccessActor,
  createRequest: createShipToolAccessRequestForOwner,
  getState: getShipToolsStateForOwner,
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function asScopePreference(value: unknown): "requester_only" | "ship" {
  return value === "ship" ? "ship" : "requester_only"
}

function toErrorResponse(error: unknown): NextResponse {
  if (error instanceof AccessControlError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
  }

  if (error instanceof ShipToolsError) {
    return NextResponse.json({ error: error.message }, { status: error.status })
  }

  console.error("Ship tools request route failed:", error)
  return NextResponse.json({ error: "Internal server error" }, { status: 500 })
}

export async function handlePostShipToolRequest(
  request: NextRequest,
  shipDeploymentId: string,
  deps: ShipToolRequestsRouteDeps = defaultDeps,
) {
  try {
    const actor = await deps.requireActor()
    const body = await request.json().catch(() => ({})) as Record<string, unknown>

    const catalogEntryId = asNonEmptyString(body.catalogEntryId)
    if (!catalogEntryId) {
      return NextResponse.json({ error: "catalogEntryId is required" }, { status: 400 })
    }

    const created = await deps.createRequest({
      ownerUserId: actor.userId,
      shipDeploymentId,
      catalogEntryId,
      requesterBridgeCrewId: asNonEmptyString(body.requesterBridgeCrewId),
      scopePreference: asScopePreference(body.scopePreference),
      rationale: asNonEmptyString(body.rationale),
      requestedByUserId: actor.userId,
      metadata: body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
        ? (body.metadata as Record<string, unknown>)
        : null,
    })

    const state = await deps.getState({
      ownerUserId: actor.userId,
      shipDeploymentId,
    })

    return NextResponse.json({ request: created, state }, { status: 201 })
  } catch (error) {
    return toErrorResponse(error)
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  return handlePostShipToolRequest(request, id)
}
