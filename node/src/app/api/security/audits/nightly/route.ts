import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { persistSecurityAuditVerificationRun } from "@/lib/security/audit/persistence"
import { runSecurityAudit } from "@/lib/security/audit/run"

export const dynamic = "force-dynamic"

function parseBearerToken(headerValue: string | null): string | null {
  if (!headerValue) {
    return null
  }

  const match = headerValue.match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim() || null
}

export async function POST(request: NextRequest) {
  try {
    const expectedToken = process.env.SECURITY_AUDIT_CRON_TOKEN?.trim()
    if (!expectedToken) {
      return NextResponse.json({ error: "SECURITY_AUDIT_CRON_TOKEN is not configured" }, { status: 503 })
    }

    const suppliedToken = parseBearerToken(request.headers.get("authorization"))
    if (!suppliedToken || suppliedToken !== expectedToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const users = await prisma.user.findMany({
      select: {
        id: true,
      },
    })

    let succeeded = 0
    let failed = 0
    const reports: Array<{ userId: string; reportId: string; riskScore: number }> = []

    for (const user of users) {
      try {
        const result = await runSecurityAudit({
          userId: user.id,
          includeBridgeCrewStress: false,
          mode: "safe_sim",
        })

        await persistSecurityAuditVerificationRun({
          userId: user.id,
          report: result.report,
        })

        reports.push({
          userId: user.id,
          reportId: result.report.reportId,
          riskScore: result.report.riskScore.score,
        })
        succeeded += 1
      } catch (error) {
        failed += 1
        console.error("Nightly security audit failed:", {
          userId: user.id,
          error: error instanceof Error ? error.message : "Unknown audit error",
        })
      }
    }

    return NextResponse.json({
      checkedUsers: users.length,
      succeeded,
      failed,
      reports,
      executedAt: new Date().toISOString(),
    })
  } catch (error) {
    console.error("Error running nightly security audit:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
