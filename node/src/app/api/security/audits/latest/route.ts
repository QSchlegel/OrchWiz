import { NextResponse } from "next/server"
import { AccessControlError, requireAccessActor } from "@/lib/security/access-control"
import { readLatestSecurityAuditReport } from "@/lib/security/audit/reporting"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const actor = await requireAccessActor()
    const latest = await readLatestSecurityAuditReport({ userId: actor.userId })

    if (!latest) {
      return NextResponse.json({ error: "No security audit report found" }, { status: 404 })
    }

    return NextResponse.json({
      reportId: latest.reportId,
      createdAt: latest.createdAt,
      riskScore: latest.riskScore,
      severityCounts: latest.severityCounts,
      reportPathMd: latest.reportPathMd || null,
      reportPathJson: latest.reportPathJson || null,
      checks: latest.checks.map((check) => ({
        id: check.id,
        name: check.name,
        status: check.status,
        findingsCount: check.findings.length,
      })),
      bridgeCrewScorecard: latest.bridgeCrewScorecard || null,
      bridgeCrewScoreDelta: latest.bridgeCrewScoreDelta,
      riskDelta: latest.riskDelta,
      previousRiskScore: latest.previousRiskScore,
    })
  } catch (error) {
    if (error instanceof AccessControlError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    console.error("Error loading latest security audit report:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
