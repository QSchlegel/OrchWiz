import { NextRequest, NextResponse } from "next/server"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import {
  BridgeCallQueueFullError,
  dispatchBridgeCallRound,
  getBridgeCallQueueSnapshot,
  listBridgeCallRounds,
  parseDirective,
  parseRequestedShipDeploymentId,
  parseRoundSource,
  parseRoundsQueryShipDeploymentId,
  parseRoundsQueryTake,
  resolveBridgeCallContext,
} from "@/lib/bridge-call/rounds"

export const dynamic = "force-dynamic"

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") {
    return {}
  }

  return value as Record<string, unknown>
}

export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const requestedShipDeploymentId = parseRoundsQueryShipDeploymentId(
      request.nextUrl.searchParams.get("shipDeploymentId"),
    )
    const take = parseRoundsQueryTake(request.nextUrl.searchParams.get("take"), 120)

    const context = await resolveBridgeCallContext({
      userId: session.user.id,
      requestedShipDeploymentId,
    })

    const rounds = await listBridgeCallRounds({
      userId: session.user.id,
      shipDeploymentId: context.selectedShipDeploymentId,
      take,
    })

    const queue = getBridgeCallQueueSnapshot({
      userId: session.user.id,
      shipDeploymentId: context.selectedShipDeploymentId,
    })

    return NextResponse.json({
      selectedShipDeploymentId: context.selectedShipDeploymentId,
      availableShips: context.availableShips,
      stations: context.stations,
      rounds,
      queue,
    })
  } catch (error) {
    console.error("Error fetching bridge-call rounds:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = asRecord(await request.json().catch(() => ({})))
    const directive = parseDirective(body.directive)

    if (!directive) {
      return NextResponse.json({ error: "directive required" }, { status: 400 })
    }

    const requestedShipDeploymentId = parseRequestedShipDeploymentId(body.shipDeploymentId)
    const source = parseRoundSource(body.source)

    const context = await resolveBridgeCallContext({
      userId: session.user.id,
      requestedShipDeploymentId,
    })

    const payload = await dispatchBridgeCallRound({
      userId: session.user.id,
      directive,
      source,
      shipDeploymentId: context.selectedShipDeploymentId,
      stations: context.stations,
    })

    return NextResponse.json(payload, { status: 201 })
  } catch (error) {
    if (error instanceof BridgeCallQueueFullError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    console.error("Error creating bridge-call round:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
