import { NextRequest, NextResponse } from "next/server"
import { AccessControlError } from "@/lib/security/access-control"
import {
  getQuartermasterLoopStatus,
  startQuartermasterLoop,
  stopQuartermasterLoop,
} from "@/lib/quartermaster/loop-runner"
import {
  isQuartermasterExecutionLevel,
  type QuartermasterLoopDefaults,
} from "@/lib/quartermaster/constants"
import {
  requireShipyardRequestActor,
  type ShipyardRequestActor,
} from "@/lib/shipyard/request-actor"
import { buildShipNotFoundErrorPayload } from "@/lib/ships/errors"

export const dynamic = "force-dynamic"

function isDevRouteEnabled(): boolean {
  return process.env.NODE_ENV !== "production"
}

function devRouteNotFoundResponse() {
  return NextResponse.json({ error: "Not found" }, { status: 404 })
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {}
  }
  return value as Record<string, unknown>
}

function asFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value
  }
  return null
}

function validateLoopDefaults(
  value: unknown,
): { ok: true; value: Partial<QuartermasterLoopDefaults> } | { ok: false; error: string } {
  if (value === undefined) {
    return { ok: true, value: {} }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, error: "loopDefaults must be an object when provided" }
  }

  const input = asRecord(value)
  const normalized: Partial<QuartermasterLoopDefaults> = {}

  if (input.intervalSeconds !== undefined) {
    const interval = asFiniteNumber(input.intervalSeconds)
    if (interval === null || interval < 10 || interval > 3600) {
      return { ok: false, error: "loopDefaults.intervalSeconds must be between 10 and 3600" }
    }
    normalized.intervalSeconds = Math.trunc(interval)
  }

  if (input.maxDurationSeconds !== undefined) {
    const maxDuration = asFiniteNumber(input.maxDurationSeconds)
    if (maxDuration === null || maxDuration < 60 || maxDuration > 86400) {
      return { ok: false, error: "loopDefaults.maxDurationSeconds must be between 60 and 86400" }
    }
    normalized.maxDurationSeconds = Math.trunc(maxDuration)
  }

  if (input.maxIterations !== undefined) {
    const maxIterations = asFiniteNumber(input.maxIterations)
    if (maxIterations === null || maxIterations < 1 || maxIterations > 1000) {
      return { ok: false, error: "loopDefaults.maxIterations must be between 1 and 1000" }
    }
    normalized.maxIterations = Math.trunc(maxIterations)
  }

  if (input.autoStopOnHealthyActive !== undefined) {
    if (typeof input.autoStopOnHealthyActive !== "boolean") {
      return { ok: false, error: "loopDefaults.autoStopOnHealthyActive must be a boolean" }
    }
    normalized.autoStopOnHealthyActive = input.autoStopOnHealthyActive
  }

  return { ok: true, value: normalized }
}

export interface DevShipQuartermasterLoopRouteDeps {
  requireActor: (request: NextRequest) => Promise<ShipyardRequestActor>
  isDevRouteEnabled: () => boolean
  getLoopStatus: typeof getQuartermasterLoopStatus
  startLoop: typeof startQuartermasterLoop
  stopLoop: typeof stopQuartermasterLoop
}

const defaultDeps: DevShipQuartermasterLoopRouteDeps = {
  requireActor: (request) => requireShipyardRequestActor(request),
  isDevRouteEnabled,
  getLoopStatus: getQuartermasterLoopStatus,
  startLoop: startQuartermasterLoop,
  stopLoop: stopQuartermasterLoop,
}

export async function handleGetDevShipQuartermasterLoop(
  request: NextRequest,
  args: { shipDeploymentId: string },
  deps: DevShipQuartermasterLoopRouteDeps = defaultDeps,
) {
  if (!deps.isDevRouteEnabled()) {
    return devRouteNotFoundResponse()
  }

  try {
    const actor = await deps.requireActor(request)
    const status = await deps.getLoopStatus({
      userId: actor.userId,
      shipDeploymentId: args.shipDeploymentId,
    })

    return NextResponse.json(status)
  } catch (error) {
    if (error instanceof AccessControlError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }

    console.error("Failed to load dev quartermaster loop status:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function handlePostDevShipQuartermasterLoop(
  request: NextRequest,
  args: { shipDeploymentId: string },
  deps: DevShipQuartermasterLoopRouteDeps = defaultDeps,
) {
  if (!deps.isDevRouteEnabled()) {
    return devRouteNotFoundResponse()
  }

  try {
    const actor = await deps.requireActor(request)
    const body = asRecord(await request.json().catch(() => ({})))
    const prompt = typeof body.prompt === "string" ? body.prompt : ""
    if (!prompt.trim()) {
      return NextResponse.json({ error: "prompt required" }, { status: 400 })
    }

    const executionLevelRaw = body.executionLevel
    if (
      executionLevelRaw !== undefined
      && !isQuartermasterExecutionLevel(executionLevelRaw)
    ) {
      return NextResponse.json(
        { error: "executionLevel must be one of: read_only, workspace_write, danger_full_access" },
        { status: 400 },
      )
    }

    const loopDefaults = validateLoopDefaults(body.loopDefaults)
    if (!loopDefaults.ok) {
      return NextResponse.json({ error: loopDefaults.error }, { status: 400 })
    }

    const status = await deps.startLoop({
      userId: actor.userId,
      shipDeploymentId: args.shipDeploymentId,
      prompt: prompt.trim(),
      executionLevel: isQuartermasterExecutionLevel(executionLevelRaw) ? executionLevelRaw : undefined,
      loopDefaults: loopDefaults.value,
    })

    return NextResponse.json(status, { status: 202 })
  } catch (error) {
    if (error instanceof AccessControlError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }
    if (
      error instanceof Error
      && error.message.includes("Ship deployment not found")
    ) {
      return NextResponse.json(buildShipNotFoundErrorPayload(), { status: 404 })
    }

    console.error("Failed to start dev quartermaster loop:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function handleDeleteDevShipQuartermasterLoop(
  request: NextRequest,
  args: { shipDeploymentId: string },
  deps: DevShipQuartermasterLoopRouteDeps = defaultDeps,
) {
  if (!deps.isDevRouteEnabled()) {
    return devRouteNotFoundResponse()
  }

  try {
    const actor = await deps.requireActor(request)
    const status = await deps.stopLoop({
      userId: actor.userId,
      shipDeploymentId: args.shipDeploymentId,
    })

    return NextResponse.json(status)
  } catch (error) {
    if (error instanceof AccessControlError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }

    console.error("Failed to stop dev quartermaster loop:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  return handleGetDevShipQuartermasterLoop(request, { shipDeploymentId: id })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  return handlePostDevShipQuartermasterLoop(request, { shipDeploymentId: id })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  return handleDeleteDevShipQuartermasterLoop(request, { shipDeploymentId: id })
}
