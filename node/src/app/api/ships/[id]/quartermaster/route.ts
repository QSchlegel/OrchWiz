import { NextRequest, NextResponse } from "next/server"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import {
  executeShipQuartermasterPrompt,
  loadShipQuartermasterStateWithInteractions,
  QuartermasterApiResponseError,
} from "@/lib/quartermaster/api"
import { parseRagBackend } from "@/lib/memory/rag-backend"

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

export interface ShipQuartermasterRouteDeps {
  getSessionUserId: () => Promise<string | null>
  loadState: typeof loadShipQuartermasterStateWithInteractions
  runPrompt: typeof executeShipQuartermasterPrompt
}

const defaultDeps: ShipQuartermasterRouteDeps = {
  getSessionUserId: async () => {
    const session = await auth.api.getSession({ headers: await headers() })
    return session?.user?.id || null
  },
  loadState: loadShipQuartermasterStateWithInteractions,
  runPrompt: executeShipQuartermasterPrompt,
}

export async function handleGetShipQuartermaster(
  args: { shipDeploymentId: string },
  deps: ShipQuartermasterRouteDeps = defaultDeps,
) {
  try {
    const userId = await deps.getSessionUserId()
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const payload = await deps.loadState({
      userId,
      shipDeploymentId: args.shipDeploymentId,
    })

    return NextResponse.json(payload)
  } catch (error) {
    if (error instanceof QuartermasterApiResponseError) {
      return NextResponse.json(error.payload, { status: error.status })
    }

    console.error("Failed to load ship quartermaster state:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function handlePostShipQuartermaster(
  request: NextRequest,
  args: { shipDeploymentId: string },
  deps: ShipQuartermasterRouteDeps = defaultDeps,
) {
  try {
    const userId = await deps.getSessionUserId()
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = asRecord(await request.json().catch(() => ({})))
    const prompt = asString(body.prompt)
    if (!prompt) {
      return NextResponse.json({ error: "prompt required" }, { status: 400 })
    }

    const payload = await deps.runPrompt({
      userId,
      shipDeploymentId: args.shipDeploymentId,
      prompt,
      requestedBackend: parseRagBackend(asString(body.backend)),
      autoProvisionIfMissing: true,
      routePath: "/api/ships/[id]/quartermaster",
    })

    const { autoProvisioned: _autoProvisioned, ...legacyPayload } = payload
    return NextResponse.json(legacyPayload)
  } catch (error) {
    if (error instanceof QuartermasterApiResponseError) {
      return NextResponse.json(error.payload, { status: error.status })
    }

    console.error("Quartermaster prompt request failed:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  return handleGetShipQuartermaster({ shipDeploymentId: id })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  return handlePostShipQuartermaster(request, { shipDeploymentId: id })
}
