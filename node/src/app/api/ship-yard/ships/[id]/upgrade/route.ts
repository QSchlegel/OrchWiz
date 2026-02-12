import { NextRequest, NextResponse } from "next/server"
import { AccessControlError } from "@/lib/security/access-control"
import {
  upgradeShipToLatest,
  ShipUpgradeError,
  type ShipUpgradeResult,
} from "@/lib/shipyard/upgrade"
import {
  requireShipyardRequestActor,
  type ShipyardRequestActor,
} from "@/lib/shipyard/request-actor"

export const dynamic = "force-dynamic"

export interface ShipUpgradeRouteDeps {
  requireActor: (request: NextRequest) => Promise<ShipyardRequestActor>
  upgradeShip: (args: {
    shipDeploymentId: string
    userId: string
  }) => Promise<ShipUpgradeResult>
}

const defaultDeps: ShipUpgradeRouteDeps = {
  requireActor: async (request) => requireShipyardRequestActor(request),
  upgradeShip: (args) => upgradeShipToLatest(args),
}

export async function handlePostShipUpgrade(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
  deps: ShipUpgradeRouteDeps = defaultDeps,
) {
  try {
    const actor = await deps.requireActor(request)
    const { id } = await params

    const result = await deps.upgradeShip({
      shipDeploymentId: id,
      userId: actor.userId,
    })

    if (result.upgraded) {
      return NextResponse.json({
        success: true,
        upgraded: true,
        fromVersion: result.fromVersion,
        toVersion: result.toVersion,
        deployment: result.deployment,
      })
    }

    return NextResponse.json({
      success: true,
      upgraded: false,
      code: "ALREADY_LATEST",
      deployment: result.deployment,
    })
  } catch (error) {
    if (error instanceof AccessControlError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }

    if (error instanceof ShipUpgradeError) {
      return NextResponse.json(
        {
          error: error.message,
          code: error.code,
          ...(error.details ? { details: error.details } : {}),
          ...(error.deployment ? { deployment: error.deployment } : {}),
        },
        { status: error.status },
      )
    }

    console.error("Error upgrading ship:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return handlePostShipUpgrade(request, { params })
}
