import { NextResponse } from "next/server"
import { AccessControlError, requireAccessActor } from "@/lib/security/access-control"
import { prisma } from "@/lib/prisma"
import { readLatestSecurityAuditReport } from "@/lib/security/audit/reporting"
import { securityIncidentsEnabled } from "@/lib/security/incident-response/feature-flag"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const actor = await requireAccessActor()
    const userId = actor.userId
    const now = new Date()
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000)

    const [
      ships,
      sessionCounts,
      recentSessions,
      taskCounts,
      recentTasks,
      latestAudit,
      incidentCounts,
      perfAgg,
      perfFailures,
      appCounts,
    ] = await Promise.all([
      // Fleet
      prisma.agentDeployment.findMany({
        where: { userId, deploymentType: "ship" },
        select: { id: true, name: true, status: true, nodeType: true, deploymentProfile: true, updatedAt: true },
        orderBy: { updatedAt: "desc" },
        take: 10,
      }),

      // Session counts by status
      prisma.session.groupBy({
        by: ["status"],
        where: { userId },
        _count: true,
      }),

      // Recent sessions
      prisma.session.findMany({
        where: { userId },
        select: { id: true, title: true, status: true, mode: true, updatedAt: true },
        orderBy: { updatedAt: "desc" },
        take: 5,
      }),

      // Task counts by status
      prisma.task.groupBy({
        by: ["status"],
        where: { session: { userId } },
        _count: true,
      }),

      // Recent tasks
      prisma.task.findMany({
        where: { session: { userId } },
        select: { id: true, name: true, status: true, sessionId: true },
        orderBy: { startedAt: "desc" },
        take: 5,
      }),

      // Security audit
      readLatestSecurityAuditReport({ userId }),

      // Incidents (only if enabled)
      securityIncidentsEnabled()
        ? prisma.securityIncident.groupBy({
            by: ["severity", "status"],
            where: { ownerUserId: userId },
            _count: true,
          })
        : Promise.resolve(null),

      // Performance (1h window)
      actor.isAdmin
        ? prisma.runtimePerformanceSample.aggregate({
            where: { createdAt: { gte: oneHourAgo } },
            _count: true,
            _avg: { durationMs: true },
            _sum: { estimatedCostUsd: true, estimatedSavingsUsd: true },
          })
        : Promise.resolve(null),

      // Performance failures (1h)
      actor.isAdmin
        ? prisma.runtimePerformanceSample.count({
            where: { createdAt: { gte: oneHourAgo }, status: { not: "success" } },
          })
        : Promise.resolve(null),

      // Application counts by status
      prisma.applicationDeployment.groupBy({
        by: ["status"],
        where: { userId },
        _count: true,
      }),
    ])

    // Assemble fleet counts
    const fleetCounts = { total: ships.length, active: 0, failed: 0, deploying: 0 }
    for (const s of ships) {
      if (s.status === "active") fleetCounts.active++
      else if (s.status === "failed") fleetCounts.failed++
      else if (s.status === "deploying") fleetCounts.deploying++
    }

    // Assemble session counts
    const sc = { total: 0, planning: 0, executing: 0, completed: 0, paused: 0, failed: 0 }
    for (const row of sessionCounts) {
      const n = row._count
      sc.total += n
      if (row.status in sc) sc[row.status as keyof typeof sc] += n
    }

    // Assemble task counts
    const tc = { total: 0, running: 0, completed: 0, failed: 0, thinking: 0 }
    for (const row of taskCounts) {
      const n = row._count
      tc.total += n
      if (row.status in tc) tc[row.status as keyof typeof tc] += n
    }

    // Assemble security
    let security: {
      latestAudit: { riskScore: unknown; severityCounts: unknown; createdAt: string; riskDelta: number | null } | null
      incidents: { total: number; open: number; critical: number; high: number }
    } = {
      latestAudit: null,
      incidents: { total: 0, open: 0, critical: 0, high: 0 },
    }

    if (latestAudit) {
      security.latestAudit = {
        riskScore: latestAudit.riskScore,
        severityCounts: latestAudit.severityCounts,
        createdAt: latestAudit.createdAt,
        riskDelta: latestAudit.riskDelta,
      }
    }

    if (incidentCounts) {
      const inc = { total: 0, open: 0, critical: 0, high: 0 }
      for (const row of incidentCounts) {
        inc.total += row._count
        const openStatuses = ["open", "investigating", "contained"]
        if (openStatuses.includes(row.status)) inc.open += row._count
        if (row.severity === "critical") inc.critical += row._count
        if (row.severity === "high") inc.high += row._count
      }
      security.incidents = inc
    }

    // Assemble performance
    let performance = null
    if (perfAgg && perfFailures !== null) {
      const total = perfAgg._count ?? 0
      performance = {
        successRate: total > 0 ? Math.round(((total - perfFailures) / total) * 100) : 100,
        avgDurationMs: Math.round(perfAgg._avg?.durationMs ?? 0),
        totalCostUsd: Number((perfAgg._sum?.estimatedCostUsd ?? 0).toFixed(4)),
        totalSavingsUsd: Number((perfAgg._sum?.estimatedSavingsUsd ?? 0).toFixed(4)),
        recentFailureCount: perfFailures,
      }
    }

    // Assemble application counts
    const ac = { total: 0, active: 0, failed: 0 }
    for (const row of appCounts) {
      ac.total += row._count
      if (row.status === "active") ac.active += row._count
      else if (row.status === "failed") ac.failed += row._count
    }

    return NextResponse.json({
      fleet: { ships, counts: fleetCounts },
      operations: {
        sessions: { counts: sc, recent: recentSessions },
        tasks: { counts: tc, recent: recentTasks },
      },
      security,
      performance,
      applications: ac,
      generatedAt: now.toISOString(),
    })
  } catch (error) {
    if (error instanceof AccessControlError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error("Mission control state error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
