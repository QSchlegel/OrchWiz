import { NextRequest, NextResponse } from "next/server"
import { AccessControlError } from "@/lib/security/access-control"
import {
  ensureShipQuartermaster,
  getShipQuartermasterState,
  updateShipQuartermasterConfig,
  type ShipQuartermasterState,
} from "@/lib/quartermaster/service"
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

async function ensureState(args: {
  userId: string
  shipDeploymentId: string
}): Promise<ShipQuartermasterState | null> {
  let state = await getShipQuartermasterState(args)
  if (!state) {
    return null
  }

  if (!state.subagent || !state.session) {
    state = await ensureShipQuartermaster({
      userId: args.userId,
      shipDeploymentId: args.shipDeploymentId,
      shipName: state.ship.name,
    })
  }

  return state
}

export interface DevShipQuartermasterConfigRouteDeps {
  requireActor: (request: NextRequest) => Promise<ShipyardRequestActor>
  isDevRouteEnabled: () => boolean
  ensureState: (args: { userId: string; shipDeploymentId: string }) => Promise<ShipQuartermasterState | null>
  updateConfig: typeof updateShipQuartermasterConfig
}

const defaultDeps: DevShipQuartermasterConfigRouteDeps = {
  requireActor: (request) => requireShipyardRequestActor(request),
  isDevRouteEnabled,
  ensureState,
  updateConfig: updateShipQuartermasterConfig,
}

export async function handleGetDevShipQuartermasterConfig(
  request: NextRequest,
  args: { shipDeploymentId: string },
  deps: DevShipQuartermasterConfigRouteDeps = defaultDeps,
) {
  if (!deps.isDevRouteEnabled()) {
    return devRouteNotFoundResponse()
  }

  try {
    const actor = await deps.requireActor(request)
    const state = await deps.ensureState({
      userId: actor.userId,
      shipDeploymentId: args.shipDeploymentId,
    })

    if (!state) {
      return NextResponse.json(buildShipNotFoundErrorPayload(), { status: 404 })
    }

    return NextResponse.json({
      ship: state.ship,
      quartermaster: state.quartermaster,
    })
  } catch (error) {
    if (error instanceof AccessControlError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }

    console.error("Failed to load dev ship quartermaster config:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function handlePutDevShipQuartermasterConfig(
  request: NextRequest,
  args: { shipDeploymentId: string },
  deps: DevShipQuartermasterConfigRouteDeps = defaultDeps,
) {
  if (!deps.isDevRouteEnabled()) {
    return devRouteNotFoundResponse()
  }

  try {
    const actor = await deps.requireActor(request)
    const body = asRecord(await request.json().catch(() => ({})))
    const executionLevelRaw = body.executionLevel

    if (!isQuartermasterExecutionLevel(executionLevelRaw)) {
      return NextResponse.json(
        { error: "executionLevel must be one of: read_only, workspace_write, danger_full_access" },
        { status: 400 },
      )
    }

    if (executionLevelRaw === "danger_full_access" && body.confirmDangerous !== true) {
      return NextResponse.json(
        {
          error: "Danger mode update requires confirmDangerous=true.",
          code: "QUARTERMASTER_DANGER_CONFIRMATION_REQUIRED",
        },
        { status: 400 },
      )
    }

    const loopDefaults = validateLoopDefaults(body.loopDefaults)
    if (!loopDefaults.ok) {
      return NextResponse.json({ error: loopDefaults.error }, { status: 400 })
    }

    const state = await deps.updateConfig({
      userId: actor.userId,
      shipDeploymentId: args.shipDeploymentId,
      executionLevel: executionLevelRaw,
      loopDefaults: loopDefaults.value,
    })

    return NextResponse.json({
      ship: state.ship,
      quartermaster: state.quartermaster,
    })
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

    console.error("Failed to update dev ship quartermaster config:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  return handleGetDevShipQuartermasterConfig(request, { shipDeploymentId: id })
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  return handlePutDevShipQuartermasterConfig(request, { shipDeploymentId: id })
}
