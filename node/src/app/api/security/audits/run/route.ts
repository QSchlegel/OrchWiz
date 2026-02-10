import { NextRequest, NextResponse } from "next/server"
import { AccessControlError, requireAccessActor } from "@/lib/security/access-control"
import { persistSecurityAuditVerificationRun } from "@/lib/security/audit/persistence"
import { runSecurityAudit } from "@/lib/security/audit/run"
import { publishNotificationUpdated } from "@/lib/realtime/notifications"

export const dynamic = "force-dynamic"

function parseMode(value: unknown): "safe_sim" | "live" {
  return value === "live" ? "live" : "safe_sim"
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requireAccessActor()
    const body = await request.json().catch(() => ({}))

    const result = await runSecurityAudit({
      userId: actor.userId,
      shipDeploymentId:
        typeof body?.shipDeploymentId === "string" && body.shipDeploymentId.trim().length > 0
          ? body.shipDeploymentId.trim()
          : null,
      includeBridgeCrewStress: body?.includeBridgeCrewStress === true,
      mode: parseMode(body?.mode),
    })

    const verificationRunId = await persistSecurityAuditVerificationRun({
      userId: actor.userId,
      report: result.report,
    })

    publishNotificationUpdated({
      userId: actor.userId,
      channel: "security",
      entityId: result.report.reportId,
    })

    return NextResponse.json({
      reportId: result.report.reportId,
      createdAt: result.report.createdAt,
      riskScore: result.report.riskScore,
      severityCounts: result.report.severityCounts,
      reportPathMd: result.reportPathMd,
      reportPathJson: result.reportPathJson,
      verificationRunId,
      bridgeCrewScorecard: result.report.bridgeCrewScorecard || null,
      bridgeCrewScoreDelta: result.report.bridgeCrewScoreDelta,
    })
  } catch (error) {
    if (error instanceof AccessControlError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    console.error("Error running security audit:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
