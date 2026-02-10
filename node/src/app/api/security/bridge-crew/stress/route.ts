import { NextRequest, NextResponse } from "next/server"
import { AccessControlError, requireAccessActor } from "@/lib/security/access-control"
import {
  BridgeCrewStressError,
  persistBridgeCrewScorecard,
  runBridgeCrewStressEvaluation,
} from "@/lib/security/bridge-crew/run"
import { publishNotificationUpdated } from "@/lib/realtime/notifications"

export const dynamic = "force-dynamic"

function parseMode(value: unknown): "safe_sim" | "live" {
  return value === "live" ? "live" : "safe_sim"
}

function parsePack(value: unknown): "core" | "extended" {
  return value === "extended" ? "extended" : "core"
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requireAccessActor()
    const body = await request.json().catch(() => ({}))

    const scorecard = await runBridgeCrewStressEvaluation({
      userId: actor.userId,
      shipDeploymentId:
        typeof body?.shipDeploymentId === "string" && body.shipDeploymentId.trim().length > 0
          ? body.shipDeploymentId.trim()
          : null,
      scenarioPack: parsePack(body?.scenarioPack),
      mode: parseMode(body?.mode),
    })

    const reportPath = await persistBridgeCrewScorecard(scorecard)

    publishNotificationUpdated({
      userId: actor.userId,
      channel: "security",
      entityId: scorecard.generatedAt,
    })

    return NextResponse.json({
      ...scorecard,
      reportPath,
    })
  } catch (error) {
    if (error instanceof AccessControlError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    if (error instanceof BridgeCrewStressError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    console.error("Error running bridge crew stress evaluation:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
