import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { AccessControlError, type AccessActor, requireAccessActor } from "@/lib/security/access-control"
import {
  parsePerformanceWindow,
  performanceWindowStart,
  summarizePerformanceRows,
  summarizeRuntimeEconomics,
  summarizeRuntimeIntelligence,
  summarizeRuntimeRlState,
  type PerformanceWindow,
} from "@/lib/performance/summary"

export const dynamic = "force-dynamic"

interface RagSummaryRow {
  effectiveBackend: string
  status: string
  fallbackUsed: boolean
  durationMs: number
}

interface RuntimeSummaryRow {
  provider: string | null
  status: string
  fallbackUsed: boolean
  durationMs: number
  executionKind: string | null
  intelligenceTier: string | null
  intelligenceDecision: string | null
  estimatedCostUsd: number | null
  estimatedCostEur: number | null
  baselineMaxCostUsd: number | null
  baselineMaxCostEur: number | null
  estimatedSavingsUsd: number | null
  estimatedSavingsEur: number | null
  rewardScore: number | null
  thresholdBefore: number | null
  thresholdAfter: number | null
  economicsEstimated: boolean | null
}

interface RagFailureRow {
  createdAt: Date
  userId: string | null
  sessionId: string | null
  shipDeploymentId: string | null
  route: string
  operation: string
  requestedBackend: string
  effectiveBackend: string
  status: string
  errorCode: string | null
  durationMs: number
}

interface RuntimeFailureRow {
  createdAt: Date
  userId: string | null
  sessionId: string | null
  source: string
  runtimeProfile: string | null
  provider: string | null
  status: string
  errorCode: string | null
  durationMs: number
  executionKind: string | null
  intelligenceTier: string | null
  intelligenceDecision: string | null
}

interface RuntimeRlStateRow {
  threshold: number
  explorationRate: number
  learningRate: number
  targetReward: number
  emaReward: number
  sampleCount: number
  lastConsolidatedAt: Date | null
}

function summarizeRagByBackend(rows: RagSummaryRow[]) {
  const grouped = new Map<string, Array<{ status: string; fallbackUsed: boolean; durationMs: number }>>()
  for (const row of rows) {
    const key = row.effectiveBackend || "unknown"
    const bucket = grouped.get(key) || []
    bucket.push({
      status: row.status,
      fallbackUsed: row.fallbackUsed,
      durationMs: row.durationMs,
    })
    grouped.set(key, bucket)
  }

  return [...grouped.entries()]
    .map(([backend, samples]) => ({
      backend,
      ...summarizePerformanceRows(samples),
    }))
    .sort((left, right) => right.count - left.count)
}

function summarizeRuntimeByProvider(rows: RuntimeSummaryRow[]) {
  const grouped = new Map<string, Array<{ status: string; fallbackUsed: boolean; durationMs: number }>>()
  for (const row of rows) {
    const key = row.provider || "unknown"
    const bucket = grouped.get(key) || []
    bucket.push({
      status: row.status,
      fallbackUsed: row.fallbackUsed,
      durationMs: row.durationMs,
    })
    grouped.set(key, bucket)
  }

  return [...grouped.entries()]
    .map(([provider, samples]) => ({
      provider,
      ...summarizePerformanceRows(samples),
    }))
    .sort((left, right) => right.count - left.count)
}

function parseWindow(searchParams: URLSearchParams): { ok: true; window: PerformanceWindow } | { ok: false } {
  const parsed = parsePerformanceWindow(searchParams.get("window"))
  if (!parsed) {
    return { ok: false }
  }
  return { ok: true, window: parsed }
}

export interface PerformanceSummaryRouteDeps {
  resolveActor: () => Promise<AccessActor>
  now: () => Date
  findRagRows: (windowStart: Date) => Promise<RagSummaryRow[]>
  findRuntimeRows: (windowStart: Date) => Promise<RuntimeSummaryRow[]>
  findRagFailures: (windowStart: Date) => Promise<RagFailureRow[]>
  findRuntimeFailures: (windowStart: Date) => Promise<RuntimeFailureRow[]>
  findRuntimeRlStateRows: () => Promise<RuntimeRlStateRow[]>
}

const defaultDeps: PerformanceSummaryRouteDeps = {
  resolveActor: () => requireAccessActor(),
  now: () => new Date(),
  findRagRows: async (windowStart) => prisma.ragPerformanceSample.findMany({
    where: {
      createdAt: {
        gte: windowStart,
      },
    },
    select: {
      effectiveBackend: true,
      status: true,
      fallbackUsed: true,
      durationMs: true,
    },
  }),
  findRuntimeRows: async (windowStart) => prisma.runtimePerformanceSample.findMany({
    where: {
      createdAt: {
        gte: windowStart,
      },
    },
    select: {
      provider: true,
      status: true,
      fallbackUsed: true,
      durationMs: true,
      executionKind: true,
      intelligenceTier: true,
      intelligenceDecision: true,
      estimatedCostUsd: true,
      estimatedCostEur: true,
      baselineMaxCostUsd: true,
      baselineMaxCostEur: true,
      estimatedSavingsUsd: true,
      estimatedSavingsEur: true,
      rewardScore: true,
      thresholdBefore: true,
      thresholdAfter: true,
      economicsEstimated: true,
    },
  }),
  findRagFailures: async (windowStart) => prisma.ragPerformanceSample.findMany({
    where: {
      createdAt: {
        gte: windowStart,
      },
      status: {
        not: "success",
      },
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 20,
    select: {
      createdAt: true,
      userId: true,
      sessionId: true,
      shipDeploymentId: true,
      route: true,
      operation: true,
      requestedBackend: true,
      effectiveBackend: true,
      status: true,
      errorCode: true,
      durationMs: true,
    },
  }),
  findRuntimeFailures: async (windowStart) => prisma.runtimePerformanceSample.findMany({
    where: {
      createdAt: {
        gte: windowStart,
      },
      status: {
        not: "success",
      },
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 20,
    select: {
      createdAt: true,
      userId: true,
      sessionId: true,
      source: true,
      runtimeProfile: true,
      provider: true,
      status: true,
      errorCode: true,
      durationMs: true,
      executionKind: true,
      intelligenceTier: true,
      intelligenceDecision: true,
    },
  }),
  findRuntimeRlStateRows: async () => prisma.runtimeIntelligencePolicyState.findMany({
    select: {
      threshold: true,
      explorationRate: true,
      learningRate: true,
      targetReward: true,
      emaReward: true,
      sampleCount: true,
      lastConsolidatedAt: true,
    },
  }),
}

export async function handleGetPerformanceSummary(
  request: NextRequest,
  deps: PerformanceSummaryRouteDeps = defaultDeps,
) {
  try {
    const actor = await deps.resolveActor()
    if (!actor.isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const parsedWindow = parseWindow(request.nextUrl.searchParams)
    if (!parsedWindow.ok) {
      return NextResponse.json(
        { error: "window must be one of 1h, 24h, 7d" },
        { status: 400 },
      )
    }

    const now = deps.now()
    const windowStart = performanceWindowStart(parsedWindow.window, now)

    const [ragRows, runtimeRows, ragFailures, runtimeFailures, runtimeRlStateRows] = await Promise.all([
      deps.findRagRows(windowStart),
      deps.findRuntimeRows(windowStart),
      deps.findRagFailures(windowStart),
      deps.findRuntimeFailures(windowStart),
      deps.findRuntimeRlStateRows(),
    ])

    const ragTotal = summarizePerformanceRows(ragRows)
    const runtimeTotal = summarizePerformanceRows(runtimeRows)
    const ragByBackend = summarizeRagByBackend(ragRows)
    const runtimeByProvider = summarizeRuntimeByProvider(runtimeRows)
    const runtimeEconomics = summarizeRuntimeEconomics(runtimeRows)
    const runtimeIntelligence = summarizeRuntimeIntelligence(runtimeRows)
    const runtimeRlState = summarizeRuntimeRlState(runtimeRlStateRows)

    const recentFailures = [
      ...ragFailures.map((failure) => ({
        type: "rag" as const,
        createdAt: failure.createdAt.toISOString(),
        userId: failure.userId,
        sessionId: failure.sessionId,
        shipDeploymentId: failure.shipDeploymentId,
        route: failure.route,
        operation: failure.operation,
        requestedBackend: failure.requestedBackend,
        effectiveBackend: failure.effectiveBackend,
        source: null as string | null,
        runtimeProfile: null as string | null,
        provider: null as string | null,
        executionKind: null as string | null,
        intelligenceTier: null as string | null,
        intelligenceDecision: null as string | null,
        status: failure.status,
        errorCode: failure.errorCode,
        durationMs: failure.durationMs,
      })),
      ...runtimeFailures.map((failure) => ({
        type: "runtime" as const,
        createdAt: failure.createdAt.toISOString(),
        userId: failure.userId,
        sessionId: failure.sessionId,
        shipDeploymentId: null as string | null,
        route: null as string | null,
        operation: null as string | null,
        requestedBackend: null as string | null,
        effectiveBackend: null as string | null,
        source: failure.source,
        runtimeProfile: failure.runtimeProfile,
        provider: failure.provider,
        executionKind: failure.executionKind,
        intelligenceTier: failure.intelligenceTier,
        intelligenceDecision: failure.intelligenceDecision,
        status: failure.status,
        errorCode: failure.errorCode,
        durationMs: failure.durationMs,
      })),
    ]
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, 20)

    return NextResponse.json({
      window: parsedWindow.window,
      from: windowStart.toISOString(),
      to: now.toISOString(),
      rag: {
        total: ragTotal,
        byBackend: ragByBackend,
      },
      runtime: {
        total: runtimeTotal,
        byProvider: runtimeByProvider,
        economics: runtimeEconomics,
        intelligence: runtimeIntelligence,
        rlState: runtimeRlState,
      },
      recentFailures,
    })
  } catch (error) {
    if (error instanceof AccessControlError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    console.error("Failed to load performance summary:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  return handleGetPerformanceSummary(request)
}
