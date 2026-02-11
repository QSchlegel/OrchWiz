import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { AccessControlError, requireAccessActor } from "@/lib/security/access-control"
import {
  parsePerformanceWindow,
  performanceWindowStart,
  summarizePerformanceRows,
  type PerformanceWindow,
} from "@/lib/performance/summary"

export const dynamic = "force-dynamic"

function summarizeRagByBackend(rows: Array<{
  effectiveBackend: string
  status: string
  fallbackUsed: boolean
  durationMs: number
}>) {
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

function summarizeRuntimeByProvider(rows: Array<{
  provider: string | null
  status: string
  fallbackUsed: boolean
  durationMs: number
}>) {
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

export async function GET(request: NextRequest) {
  try {
    const actor = await requireAccessActor()
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

    const now = new Date()
    const windowStart = performanceWindowStart(parsedWindow.window, now)

    const [ragRows, runtimeRows, ragFailures, runtimeFailures] = await Promise.all([
      prisma.ragPerformanceSample.findMany({
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
      prisma.runtimePerformanceSample.findMany({
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
        },
      }),
      prisma.ragPerformanceSample.findMany({
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
      prisma.runtimePerformanceSample.findMany({
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
        },
      }),
    ])

    const ragTotal = summarizePerformanceRows(ragRows)
    const runtimeTotal = summarizePerformanceRows(runtimeRows)
    const ragByBackend = summarizeRagByBackend(ragRows)
    const runtimeByProvider = summarizeRuntimeByProvider(runtimeRows)

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

