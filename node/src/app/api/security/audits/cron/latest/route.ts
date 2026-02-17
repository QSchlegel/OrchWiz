import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { asRecord } from "@/lib/agentsync/route-helpers"
import { AccessControlError, requireAccessActor } from "@/lib/security/access-control"

export const dynamic = "force-dynamic"

export interface SecurityAuditCronLatestRouteDeps {
  requireActor: () => Promise<{ userId: string }>
  findLatestCronVerificationRun: (args: { userId: string }) => Promise<{
    id: string
    completedAt: Date | null
    result: unknown
  } | null>
}

const defaultDeps: SecurityAuditCronLatestRouteDeps = {
  requireActor: () => requireAccessActor(),
  findLatestCronVerificationRun: (args) => prisma.verificationRun.findFirst({
    where: {
      session: {
        userId: args.userId,
      },
      result: {
        path: ["securityAudit", "trigger"],
        equals: "cron",
      },
    },
    orderBy: {
      completedAt: "desc",
    },
    select: {
      id: true,
      completedAt: true,
      result: true,
    },
  }),
}

export async function handleGetLatestSecurityAuditCron(
  deps: SecurityAuditCronLatestRouteDeps = defaultDeps,
) {
  try {
    const actor = await deps.requireActor()
    const latest = await deps.findLatestCronVerificationRun({ userId: actor.userId })

    if (!latest) {
      return NextResponse.json({ error: "No automated security audit run found" }, { status: 404 })
    }

    const root = asRecord(latest.result)
    const securityAudit = asRecord(root.securityAudit)
    const quartermasterReview = asRecord(securityAudit.quartermasterReview)
    const unusualReadings = Array.isArray(securityAudit.unusualReadings) ? securityAudit.unusualReadings : []

    return NextResponse.json({
      verificationRunId: latest.id,
      completedAt: latest.completedAt ? latest.completedAt.toISOString() : null,
      trigger: securityAudit.trigger || "cron",
      dayKey: securityAudit.dayKey || null,
      reportId: securityAudit.reportId || null,
      createdAt: securityAudit.createdAt || null,
      mode: securityAudit.mode || null,
      riskScore: securityAudit.riskScore || null,
      severityCounts: securityAudit.severityCounts || null,
      riskDelta: securityAudit.riskDelta ?? null,
      previousRiskScore: securityAudit.previousRiskScore ?? null,
      reportPathMd: securityAudit.reportPathMd || null,
      reportPathJson: securityAudit.reportPathJson || null,
      checks: Array.isArray(securityAudit.checks) ? securityAudit.checks : [],
      unusualReadings,
      quartermasterReview: {
        status: quartermasterReview.status || null,
        generatedAt: quartermasterReview.generatedAt || null,
        text: quartermasterReview.text || null,
        provider: quartermasterReview.provider || null,
        fallbackUsed: quartermasterReview.fallbackUsed === true,
        warnings: Array.isArray(quartermasterReview.warnings) ? quartermasterReview.warnings : [],
        vaultReviewPath: quartermasterReview.vaultReviewPath || null,
        quartermasterSessionId: quartermasterReview.quartermasterSessionId || null,
        quartermasterInteractionId: quartermasterReview.quartermasterInteractionId || null,
        errorMessage: quartermasterReview.errorMessage || null,
      },
    })
  } catch (error) {
    if (error instanceof AccessControlError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    console.error("Error loading latest automated security audit run:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function GET() {
  return handleGetLatestSecurityAuditCron()
}
