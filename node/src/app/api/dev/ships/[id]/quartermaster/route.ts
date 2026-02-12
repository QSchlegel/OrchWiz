import { NextRequest, NextResponse } from "next/server"
import {
  executeShipQuartermasterPrompt,
  loadShipQuartermasterStateWithInteractions,
  QuartermasterApiResponseError,
} from "@/lib/quartermaster/api"
import { parseRagBackend } from "@/lib/memory/rag-backend"
import { AccessControlError } from "@/lib/security/access-control"
import {
  requireShipyardRequestActor,
  type ShipyardRequestActor,
} from "@/lib/shipyard/request-actor"

export const dynamic = "force-dynamic"

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") {
    return {}
  }
  return value as Record<string, unknown>
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function isDevRouteEnabled(): boolean {
  return process.env.NODE_ENV !== "production"
}

function devRouteNotFoundResponse() {
  return NextResponse.json({ error: "Not found" }, { status: 404 })
}

export interface DevShipQuartermasterRouteDeps {
  requireActor: (request: NextRequest) => Promise<ShipyardRequestActor>
  loadState: typeof loadShipQuartermasterStateWithInteractions
  runPrompt: typeof executeShipQuartermasterPrompt
}

const defaultDeps: DevShipQuartermasterRouteDeps = {
  requireActor: (request) => requireShipyardRequestActor(request),
  loadState: loadShipQuartermasterStateWithInteractions,
  runPrompt: executeShipQuartermasterPrompt,
}

export async function handleGetDevShipQuartermaster(
  request: NextRequest,
  args: { shipDeploymentId: string },
  deps: DevShipQuartermasterRouteDeps = defaultDeps,
) {
  if (!isDevRouteEnabled()) {
    return devRouteNotFoundResponse()
  }

  try {
    const actor = await deps.requireActor(request)
    const payload = await deps.loadState({
      userId: actor.userId,
      shipDeploymentId: args.shipDeploymentId,
    })

    return NextResponse.json(payload)
  } catch (error) {
    if (error instanceof AccessControlError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }
    if (error instanceof QuartermasterApiResponseError) {
      return NextResponse.json(error.payload, { status: error.status })
    }

    console.error("Failed to load dev ship quartermaster state:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function handlePostDevShipQuartermaster(
  request: NextRequest,
  args: { shipDeploymentId: string },
  deps: DevShipQuartermasterRouteDeps = defaultDeps,
) {
  if (!isDevRouteEnabled()) {
    return devRouteNotFoundResponse()
  }

  try {
    const actor = await deps.requireActor(request)
    const body = asRecord(await request.json().catch(() => ({})))
    const prompt = asString(body.prompt)
    if (!prompt) {
      return NextResponse.json({ error: "prompt required" }, { status: 400 })
    }

    const payload = await deps.runPrompt({
      userId: actor.userId,
      shipDeploymentId: args.shipDeploymentId,
      prompt,
      requestedBackend: parseRagBackend(asString(body.backend)),
      autoProvisionIfMissing: true,
      routePath: "/api/dev/ships/[id]/quartermaster",
    })

    return NextResponse.json(payload)
  } catch (error) {
    if (error instanceof AccessControlError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }
    if (error instanceof QuartermasterApiResponseError) {
      return NextResponse.json(error.payload, { status: error.status })
    }

    console.error("Dev quartermaster prompt request failed:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  return handleGetDevShipQuartermaster(request, { shipDeploymentId: id })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  return handlePostDevShipQuartermaster(request, { shipDeploymentId: id })
}

