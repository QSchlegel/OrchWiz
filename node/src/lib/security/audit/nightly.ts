import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { persistSecurityAuditVerificationRun } from "@/lib/security/audit/persistence"
import { runSecurityAudit } from "@/lib/security/audit/run"
import type { SecurityAuditReport } from "@/lib/security/audit/types"
import { computeUnusualReadings } from "@/lib/security/audit/unusual-readings"
import { runQuartermasterSecurityAuditReview } from "@/lib/security/audit/quartermaster-review"
import { publishNotificationUpdated } from "@/lib/realtime/notifications"

export interface SecurityAuditCronUserResult {
  userId: string
  status: "ran" | "skipped" | "failed"
  reportId: string | null
  riskScore: number | null
  verificationRunId: string | null
  unusualReadingsCount: number | null
  quartermasterReviewStatus: "ok" | "error" | null
  vaultReviewPath: string | null
  errorMessage: string | null
}

export interface SecurityAuditCronSummary {
  checkedUsers: number
  succeeded: number
  skipped: number
  failed: number
  executedAt: string
  dayKey: string
  users: SecurityAuditCronUserResult[]
}

function utcDayKey(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") {
    return {}
  }
  return value as Record<string, unknown>
}

function patchSecurityAuditResult(args: {
  existing: unknown
  patch: Record<string, unknown>
}): Record<string, unknown> {
  const root = asRecord(args.existing)
  const securityAudit = asRecord(root.securityAudit)
  return {
    ...root,
    securityAudit: {
      ...securityAudit,
      ...args.patch,
    },
  }
}

async function userIdsWithCronRunForDay(args: { userIds: string[]; dayKey: string }): Promise<Set<string>> {
  if (args.userIds.length === 0) {
    return new Set()
  }

  const runs = await prisma.verificationRun.findMany({
    where: {
      session: {
        userId: {
          in: args.userIds,
        },
      },
      AND: [
        {
          result: {
            path: ["securityAudit", "trigger"],
            equals: "cron",
          },
        },
        {
          result: {
            path: ["securityAudit", "dayKey"],
            equals: args.dayKey,
          },
        },
      ],
    },
    select: {
      session: {
        select: {
          userId: true,
        },
      },
    },
  })

  return new Set(runs.map((run) => run.session.userId))
}

export async function runDueNightlySecurityAudits(args?: {
  now?: Date
  includeQuartermasterReview?: boolean
  dryRun?: boolean
  force?: boolean
}): Promise<SecurityAuditCronSummary> {
  const now = args?.now || new Date()
  const dayKey = utcDayKey(now)
  const includeQuartermasterReview = args?.includeQuartermasterReview !== false
  const dryRun = args?.dryRun === true
  const force = args?.force === true

  const users = await prisma.user.findMany({ select: { id: true } })
  const userIds = users.map((user) => user.id)
  const alreadyRan = await userIdsWithCronRunForDay({ userIds, dayKey })

  const results: SecurityAuditCronUserResult[] = []
  let succeeded = 0
  let skipped = 0
  let failed = 0

  for (const user of users) {
    if (!force && alreadyRan.has(user.id)) {
      skipped += 1
      results.push({
        userId: user.id,
        status: "skipped",
        reportId: null,
        riskScore: null,
        verificationRunId: null,
        unusualReadingsCount: null,
        quartermasterReviewStatus: null,
        vaultReviewPath: null,
        errorMessage: null,
      })
      continue
    }

    if (dryRun) {
      results.push({
        userId: user.id,
        status: "skipped",
        reportId: null,
        riskScore: null,
        verificationRunId: null,
        unusualReadingsCount: null,
        quartermasterReviewStatus: null,
        vaultReviewPath: null,
        errorMessage: null,
      })
      continue
    }

    try {
      const runResult = await runSecurityAudit({
        userId: user.id,
        includeBridgeCrewStress: false,
        mode: "safe_sim",
      })

      const report: SecurityAuditReport = runResult.report
      const unusualReadings = computeUnusualReadings(report)

      const verificationRunId = await persistSecurityAuditVerificationRun({
        userId: user.id,
        report,
        trigger: "cron",
        dayKey,
        unusualReadings,
      })

      let reviewStatus: "ok" | "error" | null = null
      let vaultReviewPath: string | null = null
      if (includeQuartermasterReview) {
        const review = await runQuartermasterSecurityAuditReview({
          userId: user.id,
          report,
          unusualReadings,
          trigger: "cron",
          dayKey,
        })
        reviewStatus = review.status
        vaultReviewPath = review.vaultReviewPath

        const existing = await prisma.verificationRun.findUnique({
          where: { id: verificationRunId },
          select: { result: true },
        })

        const updatedResult = patchSecurityAuditResult({
          existing: existing?.result,
          patch: {
            quartermasterReview: {
              status: review.status,
              generatedAt: review.generatedAt,
              text: review.text,
              provider: review.provider,
              fallbackUsed: review.fallbackUsed,
              warnings: review.warnings,
              vaultReviewPath: review.vaultReviewPath,
              quartermasterSessionId: review.quartermasterSessionId,
              quartermasterInteractionId: review.quartermasterInteractionId,
              errorMessage: review.errorMessage,
            },
          },
        })

        await prisma.verificationRun.update({
          where: { id: verificationRunId },
          data: {
            result: updatedResult as unknown as Prisma.InputJsonValue,
          },
        })
      }

      publishNotificationUpdated({
        userId: user.id,
        channel: "security",
        entityId: report.reportId,
      })

      succeeded += 1
      results.push({
        userId: user.id,
        status: "ran",
        reportId: report.reportId,
        riskScore: report.riskScore.score,
        verificationRunId,
        unusualReadingsCount: unusualReadings.length,
        quartermasterReviewStatus: reviewStatus,
        vaultReviewPath,
        errorMessage: null,
      })
    } catch (error) {
      failed += 1
      results.push({
        userId: user.id,
        status: "failed",
        reportId: null,
        riskScore: null,
        verificationRunId: null,
        unusualReadingsCount: null,
        quartermasterReviewStatus: null,
        vaultReviewPath: null,
        errorMessage: error instanceof Error ? error.message : "Unknown audit error",
      })
    }
  }

  return {
    checkedUsers: users.length,
    succeeded,
    skipped,
    failed,
    executedAt: now.toISOString(),
    dayKey,
    users: results,
  }
}
