import { createHash } from "node:crypto"
import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"

function asBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback
  const normalized = value.trim().toLowerCase()
  if (["1", "true", "yes", "on"].includes(normalized)) return true
  if (["0", "false", "no", "off"].includes(normalized)) return false
  return fallback
}

function performanceTrackingEnabled(): boolean {
  return asBoolean(process.env.PERFORMANCE_TRACKING_ENABLED, true)
}

function normalizeDurationMs(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    return 0
  }
  return Math.round(value)
}

export function hashQuery(query: string): string {
  const salt = process.env.PERFORMANCE_QUERY_HASH_SALT?.trim() || ""
  return createHash("sha256").update(`${salt}:${query}`, "utf8").digest("hex")
}

export interface RagPerformanceSampleInput {
  userId?: string | null
  sessionId?: string | null
  shipDeploymentId?: string | null
  route: string
  operation: string
  requestedBackend: string
  effectiveBackend: string
  mode?: string | null
  scope?: string | null
  status: string
  fallbackUsed?: boolean
  durationMs: number
  resultCount?: number | null
  query?: string | null
  errorCode?: string | null
}

export interface RuntimePerformanceSampleInput {
  userId?: string | null
  sessionId?: string | null
  source: string
  runtimeProfile?: string | null
  provider?: string | null
  status: string
  fallbackUsed?: boolean
  durationMs: number
  errorCode?: string | null
  executionKind?: string | null
  intelligenceTier?: string | null
  intelligenceDecision?: string | null
  resolvedModel?: string | null
  classifierModel?: string | null
  classifierConfidence?: number | null
  thresholdBefore?: number | null
  thresholdAfter?: number | null
  rewardScore?: number | null
  estimatedPromptTokens?: number | null
  estimatedCompletionTokens?: number | null
  estimatedTotalTokens?: number | null
  estimatedCostUsd?: number | null
  estimatedCostEur?: number | null
  baselineMaxCostUsd?: number | null
  baselineMaxCostEur?: number | null
  estimatedSavingsUsd?: number | null
  estimatedSavingsEur?: number | null
  currencyFxUsdToEur?: number | null
  economicsEstimated?: boolean | null
}

function normalizeOptionalString(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null
  }
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function normalizeOptionalFloat(value: number | null | undefined): number | null {
  if (!Number.isFinite(value as number)) {
    return null
  }
  return Number(value)
}

function normalizeOptionalInt(value: number | null | undefined): number | null {
  if (!Number.isFinite(value as number)) {
    return null
  }
  const rounded = Math.round(value as number)
  return rounded < 0 ? 0 : rounded
}

function normalizeOptionalBoolean(value: boolean | null | undefined): boolean | null {
  return typeof value === "boolean" ? value : null
}

interface RagPerformanceDeps {
  create: (data: Prisma.RagPerformanceSampleUncheckedCreateInput) => Promise<void>
}

interface RuntimePerformanceDeps {
  create: (data: Prisma.RuntimePerformanceSampleUncheckedCreateInput) => Promise<void>
}

const defaultRagDeps: RagPerformanceDeps = {
  create: async (data) => {
    await prisma.ragPerformanceSample.create({
      data,
    })
  },
}

const defaultRuntimeDeps: RuntimePerformanceDeps = {
  create: async (data) => {
    await prisma.runtimePerformanceSample.create({
      data,
    })
  },
}

export async function recordRagPerformanceSample(
  input: RagPerformanceSampleInput,
  deps: RagPerformanceDeps = defaultRagDeps,
): Promise<void> {
  if (!performanceTrackingEnabled()) {
    return
  }

  try {
    const query = typeof input.query === "string" ? input.query : ""
    const hasQuery = query.trim().length > 0
    await deps.create({
      userId: input.userId || null,
      sessionId: input.sessionId || null,
      shipDeploymentId: input.shipDeploymentId || null,
      route: input.route,
      operation: input.operation,
      requestedBackend: input.requestedBackend,
      effectiveBackend: input.effectiveBackend,
      mode: input.mode || null,
      scope: input.scope || null,
      status: input.status,
      fallbackUsed: input.fallbackUsed === true,
      durationMs: normalizeDurationMs(input.durationMs),
      resultCount: typeof input.resultCount === "number" ? Math.max(0, Math.round(input.resultCount)) : null,
      queryHash: hasQuery ? hashQuery(query) : null,
      queryLength: hasQuery ? query.length : null,
      errorCode: input.errorCode || null,
    })
  } catch (error) {
    console.error("Failed to persist RAG performance sample (fail-open):", error)
  }
}

export async function recordRuntimePerformanceSample(
  input: RuntimePerformanceSampleInput,
  deps: RuntimePerformanceDeps = defaultRuntimeDeps,
): Promise<void> {
  if (!performanceTrackingEnabled()) {
    return
  }

  try {
    await deps.create({
      userId: input.userId || null,
      sessionId: input.sessionId || null,
      source: input.source,
      runtimeProfile: input.runtimeProfile || null,
      provider: input.provider || null,
      status: input.status,
      fallbackUsed: input.fallbackUsed === true,
      durationMs: normalizeDurationMs(input.durationMs),
      errorCode: input.errorCode || null,
      executionKind: normalizeOptionalString(input.executionKind),
      intelligenceTier: normalizeOptionalString(input.intelligenceTier),
      intelligenceDecision: normalizeOptionalString(input.intelligenceDecision),
      resolvedModel: normalizeOptionalString(input.resolvedModel),
      classifierModel: normalizeOptionalString(input.classifierModel),
      classifierConfidence: normalizeOptionalFloat(input.classifierConfidence),
      thresholdBefore: normalizeOptionalFloat(input.thresholdBefore),
      thresholdAfter: normalizeOptionalFloat(input.thresholdAfter),
      rewardScore: normalizeOptionalFloat(input.rewardScore),
      estimatedPromptTokens: normalizeOptionalInt(input.estimatedPromptTokens),
      estimatedCompletionTokens: normalizeOptionalInt(input.estimatedCompletionTokens),
      estimatedTotalTokens: normalizeOptionalInt(input.estimatedTotalTokens),
      estimatedCostUsd: normalizeOptionalFloat(input.estimatedCostUsd),
      estimatedCostEur: normalizeOptionalFloat(input.estimatedCostEur),
      baselineMaxCostUsd: normalizeOptionalFloat(input.baselineMaxCostUsd),
      baselineMaxCostEur: normalizeOptionalFloat(input.baselineMaxCostEur),
      estimatedSavingsUsd: normalizeOptionalFloat(input.estimatedSavingsUsd),
      estimatedSavingsEur: normalizeOptionalFloat(input.estimatedSavingsEur),
      currencyFxUsdToEur: normalizeOptionalFloat(input.currencyFxUsdToEur),
      economicsEstimated: normalizeOptionalBoolean(input.economicsEstimated),
    })
  } catch (error) {
    console.error("Failed to persist runtime performance sample (fail-open):", error)
  }
}
