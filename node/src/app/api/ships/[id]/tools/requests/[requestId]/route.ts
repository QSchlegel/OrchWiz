import { NextRequest, NextResponse } from "next/server"
import { AccessControlError, requireAccessActor, type AccessActor } from "@/lib/security/access-control"
import {
  getShipToolsStateForOwner,
  reviewShipToolAccessRequestForOwner,
  ShipToolsError,
} from "@/lib/tools/requests"

export const dynamic = "force-dynamic"

interface ShipToolRequestReviewRouteDeps {
  requireActor: () => Promise<AccessActor>
  reviewRequest: typeof reviewShipToolAccessRequestForOwner
  getState: typeof getShipToolsStateForOwner
}

const defaultDeps: ShipToolRequestReviewRouteDeps = {
  requireActor: requireAccessActor,
  reviewRequest: reviewShipToolAccessRequestForOwner,
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

  console.error("Ship tools request review route failed:", error)
  return NextResponse.json({ error: "Internal server error" }, { status: 500 })
}

export async function handlePatchShipToolRequest(
  request: NextRequest,
  shipDeploymentId: string,
  requestId: string,
  deps: ShipToolRequestReviewRouteDeps = defaultDeps,
) {
  try {
    const actor = await deps.requireActor()
    const body = await request.json().catch(() => ({})) as Record<string, unknown>

    const decisionRaw = asNonEmptyString(body.decision)
    const decision = decisionRaw === "approve" || decisionRaw === "deny" ? decisionRaw : null
    if (!decision) {
      return NextResponse.json({ error: "decision must be approve or deny" }, { status: 400 })
    }

    const grantModeRaw = asNonEmptyString(body.grantMode)
    const grantMode = grantModeRaw === "requester_only" || grantModeRaw === "ship"
      ? grantModeRaw
      : undefined

    const result = await deps.reviewRequest({
      ownerUserId: actor.userId,
      shipDeploymentId,
      requestId,
      decision,
      grantMode,
      reviewedByUserId: actor.userId,
      reviewNote: asNonEmptyString(body.reviewNote),
    })

    const state = await deps.getState({
      ownerUserId: actor.userId,
      shipDeploymentId,
    })

    return NextResponse.json({ ...result, state })
  } catch (error) {
    return toErrorResponse(error)
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; requestId: string }> },
) {
  const { id, requestId } = await params
  return handlePatchShipToolRequest(request, id, requestId)
}
