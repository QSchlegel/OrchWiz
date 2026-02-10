import { NextResponse } from "next/server"
import { AccessControlError, requireAccessActor } from "@/lib/security/access-control"
import {
  getLatestBridgeCrewScorecard,
  persistBridgeCrewScorecard,
  runBridgeCrewStressEvaluation,
} from "@/lib/security/bridge-crew/run"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const actor = await requireAccessActor()

    let scorecard = await getLatestBridgeCrewScorecard({ userId: actor.userId })
    if (!scorecard) {
      scorecard = await runBridgeCrewStressEvaluation({
        userId: actor.userId,
        scenarioPack: "core",
        mode: "safe_sim",
      })
      await persistBridgeCrewScorecard(scorecard)
    }

    return NextResponse.json({
      overallScore: scorecard.overallScore,
      perStationScores: scorecard.perStationScores,
      failingScenarios: scorecard.failingScenarios,
      generatedAt: scorecard.generatedAt,
      mode: scorecard.mode,
      scenarioPack: scorecard.scenarioPack,
      sampleSize: scorecard.sampleSize,
      scenarioResults: scorecard.scenarioResults,
    })
  } catch (error) {
    if (error instanceof AccessControlError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    console.error("Error loading bridge crew scorecard:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
