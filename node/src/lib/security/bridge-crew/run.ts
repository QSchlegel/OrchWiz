import { mkdir, readdir, readFile, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import type { BridgeCrewRole } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { resolveBridgeCrewScorecardDirectory } from "@/lib/security/paths"
import { evaluateBridgeCrewScenarios } from "./evaluator"
import { scenariosForPack } from "./scenarios"
import type {
  BridgeCrewScenarioPack,
  BridgeCrewScorecard,
  BridgeCrewStationMetrics,
  BridgeCrewStressMode,
} from "./types"

const ALL_STATIONS: BridgeCrewRole[] = ["xo", "ops", "eng", "sec", "med", "cou"]

export class BridgeCrewStressError extends Error {
  status: number

  constructor(message: string, status = 400) {
    super(message)
    this.name = "BridgeCrewStressError"
    this.status = status
  }
}

function scorecardFilePrefix(userId: string): string {
  const safeUser = userId.replace(/[^a-zA-Z0-9_-]/g, "-")
  return `scorecard_${safeUser}_`
}

function percentile(values: number[], pct: number): number | null {
  if (values.length === 0) {
    return null
  }

  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((pct / 100) * sorted.length) - 1))
  return sorted[index]
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function emptyMetrics(stationKey: BridgeCrewRole): BridgeCrewStationMetrics {
  return {
    stationKey,
    total: 0,
    success: 0,
    failed: 0,
    offline: 0,
    retryRate: 0,
    successRate: 0,
    p95LatencyMs: null,
  }
}

function buildStationMetrics(args: {
  stationKey: BridgeCrewRole
  rows: Array<{
    status: "success" | "offline" | "failed"
    attemptCount: number
    wasRetried: boolean
    latencyMs: number | null
  }>
}): BridgeCrewStationMetrics {
  const total = args.rows.length
  if (total === 0) {
    return emptyMetrics(args.stationKey)
  }

  let success = 0
  let failed = 0
  let offline = 0
  let retries = 0
  const latencies: number[] = []

  for (const row of args.rows) {
    if (row.status === "success") {
      success += 1
    } else if (row.status === "offline") {
      offline += 1
    } else {
      failed += 1
    }

    if (row.wasRetried || row.attemptCount > 1) {
      retries += 1
    }

    if (row.latencyMs !== null && Number.isFinite(row.latencyMs)) {
      latencies.push(row.latencyMs)
    }
  }

  return {
    stationKey: args.stationKey,
    total,
    success,
    failed,
    offline,
    retryRate: retries / total,
    successRate: success / total,
    p95LatencyMs: percentile(latencies, 95),
  }
}

export async function runBridgeCrewStressEvaluation(args: {
  userId: string
  shipDeploymentId?: string | null
  scenarioPack?: BridgeCrewScenarioPack
  mode?: BridgeCrewStressMode
}): Promise<BridgeCrewScorecard> {
  const scenarioPack = args.scenarioPack || "core"
  const mode = args.mode || "safe_sim"

  if (mode === "live" && process.env.ENABLE_BRIDGE_CREW_LIVE_STRESS !== "true") {
    throw new BridgeCrewStressError(
      "Live stress mode is disabled. Set ENABLE_BRIDGE_CREW_LIVE_STRESS=true to opt in.",
      403,
    )
  }

  const rows = await prisma.bridgeCallOfficerResult.findMany({
    where: {
      round: {
        userId: args.userId,
        ...(args.shipDeploymentId
          ? {
              shipDeploymentId: args.shipDeploymentId,
            }
          : {}),
      },
    },
    select: {
      stationKey: true,
      status: true,
      attemptCount: true,
      wasRetried: true,
      latencyMs: true,
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 320,
  })

  const metricsByStation: Record<BridgeCrewRole, BridgeCrewStationMetrics> = {
    xo: emptyMetrics("xo"),
    ops: emptyMetrics("ops"),
    eng: emptyMetrics("eng"),
    sec: emptyMetrics("sec"),
    med: emptyMetrics("med"),
    cou: emptyMetrics("cou"),
  }

  for (const station of ALL_STATIONS) {
    const stationRows = rows
      .filter((row) => row.stationKey === station)
      .map((row) => ({
        status: row.status,
        attemptCount: row.attemptCount,
        wasRetried: row.wasRetried,
        latencyMs: asNumber(row.latencyMs),
      }))

    metricsByStation[station] = buildStationMetrics({
      stationKey: station,
      rows: stationRows,
    })
  }

  const scenarios = scenariosForPack(scenarioPack)
  return evaluateBridgeCrewScenarios({
    userId: args.userId,
    mode,
    scenarioPack,
    scenarios,
    metricsByStation,
  })
}

export async function persistBridgeCrewScorecard(scorecard: BridgeCrewScorecard): Promise<string> {
  const root = resolveBridgeCrewScorecardDirectory()
  await mkdir(root, { recursive: true })

  const timestamp = scorecard.generatedAt.replace(/[:.]/g, "-")
  const filename = `${scorecardFilePrefix(scorecard.userId)}${timestamp}.json`
  const fullPath = resolve(root, filename)

  await writeFile(fullPath, JSON.stringify(scorecard, null, 2), "utf8")
  return fullPath
}

export async function getLatestBridgeCrewScorecard(args: {
  userId: string
}): Promise<BridgeCrewScorecard | null> {
  const root = resolveBridgeCrewScorecardDirectory()
  const prefix = scorecardFilePrefix(args.userId)

  let files: string[]
  try {
    files = await readdir(root)
  } catch {
    return null
  }

  const candidates = files
    .filter((file) => file.startsWith(prefix) && file.endsWith(".json"))
    .sort()
    .reverse()

  for (const candidate of candidates) {
    try {
      const fullPath = resolve(root, candidate)
      const raw = await readFile(fullPath, "utf8")
      const parsed = JSON.parse(raw) as BridgeCrewScorecard
      if (parsed.userId === args.userId) {
        return parsed
      }
    } catch {
      // Skip unreadable or malformed files.
    }
  }

  return null
}
