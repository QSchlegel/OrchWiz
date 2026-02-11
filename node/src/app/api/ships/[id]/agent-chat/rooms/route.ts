import { NextRequest, NextResponse } from "next/server"
import {
  AccessControlError,
  requireAccessActor,
  type AccessActor,
} from "@/lib/security/access-control"
import {
  createShipBridgeAgentChatRoom,
  listShipBridgeAgentChatRooms,
} from "@/lib/bridge-agent-chat/service"
import { BridgeAgentChatError } from "@/lib/bridge-agent-chat/types"

export const dynamic = "force-dynamic"

interface RoomsRouteDeps {
  requireActor: () => Promise<AccessActor>
  listRooms: typeof listShipBridgeAgentChatRooms
  createRoom: typeof createShipBridgeAgentChatRoom
}

const defaultDeps: RoomsRouteDeps = {
  requireActor: requireAccessActor,
  listRooms: listShipBridgeAgentChatRooms,
  createRoom: createShipBridgeAgentChatRoom,
}

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

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.filter((entry): entry is string => typeof entry === "string")
}

function toErrorResponse(error: unknown): NextResponse {
  if (error instanceof AccessControlError) {
    return NextResponse.json(
      {
        error: error.message,
        code: error.code,
      },
      { status: error.status },
    )
  }

  if (error instanceof BridgeAgentChatError) {
    return NextResponse.json(
      {
        error: error.message,
        code: error.code,
        ...(error.details ? { details: error.details } : {}),
      },
      { status: error.status },
    )
  }

  console.error("Bridge agent chat rooms route failed:", error)
  return NextResponse.json({ error: "Internal server error" }, { status: 500 })
}

export async function handleGetRooms(
  request: NextRequest,
  shipDeploymentId: string,
  deps: RoomsRouteDeps = defaultDeps,
) {
  try {
    const actor = await deps.requireActor()
    const memberBridgeCrewId = asNonEmptyString(request.nextUrl.searchParams.get("memberBridgeCrewId"))
    const takeRaw = request.nextUrl.searchParams.get("take")
    const parsedTake = takeRaw ? Number.parseInt(takeRaw, 10) : NaN
    const take = Number.isFinite(parsedTake) && parsedTake > 0 ? parsedTake : undefined

    const result = await deps.listRooms({
      actor,
      shipDeploymentId,
      memberBridgeCrewId,
      take,
    })

    return NextResponse.json(result)
  } catch (error) {
    return toErrorResponse(error)
  }
}

export async function handlePostRooms(
  request: NextRequest,
  shipDeploymentId: string,
  deps: RoomsRouteDeps = defaultDeps,
) {
  try {
    const actor = await deps.requireActor()
    const body = asRecord(await request.json().catch(() => ({})))

    const result = await deps.createRoom({
      actor,
      shipDeploymentId,
      input: {
        roomType: typeof body.roomType === "string" ? body.roomType : "",
        title: asNonEmptyString(body.title),
        memberBridgeCrewIds: asStringArray(body.memberBridgeCrewIds),
        createdByBridgeCrewId: asNonEmptyString(body.createdByBridgeCrewId),
      },
    })

    return NextResponse.json(result, { status: result.created ? 201 : 200 })
  } catch (error) {
    return toErrorResponse(error)
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  return handleGetRooms(request, id)
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  return handlePostRooms(request, id)
}
