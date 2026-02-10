import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { publishRealtimeEvent } from "@/lib/realtime/events"
import type { SecurityAuditReport } from "./types"

async function ensureSecurityAuditSession(userId: string): Promise<string> {
  const existing = await prisma.session.findFirst({
    where: {
      userId,
    },
    select: {
      id: true,
    },
    orderBy: {
      updatedAt: "desc",
    },
  })

  if (existing) {
    return existing.id
  }

  const created = await prisma.session.create({
    data: {
      userId,
      title: "Security Audit",
      description: "Automated security audit run",
      status: "completed",
      mode: "plan",
      source: "web",
      metadata: {
        securityAudit: true,
      } as Prisma.InputJsonValue,
      completedAt: new Date(),
    },
    select: {
      id: true,
    },
  })

  return created.id
}

export async function persistSecurityAuditVerificationRun(args: {
  userId: string
  report: SecurityAuditReport
}): Promise<string> {
  const sessionId = await ensureSecurityAuditSession(args.userId)
  const resultPayload = {
    securityAudit: {
      reportId: args.report.reportId,
      riskScore: args.report.riskScore,
      severityCounts: args.report.severityCounts,
      findingsCount: args.report.findings.length,
      reportPathMd: args.report.reportPathMd || null,
      reportPathJson: args.report.reportPathJson || null,
    },
  }

  const run = await prisma.verificationRun.create({
    data: {
      sessionId,
      type: "test_suite",
      status: args.report.riskScore.level,
      result: resultPayload as unknown as Prisma.InputJsonValue,
      iterations: 1,
      feedback: `Security audit ${args.report.reportId} completed with risk score ${args.report.riskScore.score}.`,
      completedAt: new Date(args.report.createdAt),
    },
    select: {
      id: true,
      sessionId: true,
      status: true,
    },
  })

  publishRealtimeEvent({
    type: "verification.updated",
    userId: args.userId,
    payload: {
      runId: run.id,
      sessionId: run.sessionId,
      status: run.status,
      userId: args.userId,
    },
  })

  return run.id
}
