import assert from "node:assert/strict"
import test from "node:test"
import type { NextRequest } from "next/server"
import { handleGetPerformanceSummary, type PerformanceSummaryRouteDeps } from "./route"

function requestFor(url: string): NextRequest {
  return {
    headers: new Headers(),
    nextUrl: new URL(url),
  } as unknown as NextRequest
}

function baseDeps(overrides?: Partial<PerformanceSummaryRouteDeps>): PerformanceSummaryRouteDeps {
  return {
    resolveActor: async () => ({
      userId: "admin-1",
      email: "admin@example.com",
      role: "admin",
      isAdmin: true,
    }),
    now: () => new Date("2026-02-11T12:00:00.000Z"),
    findRagRows: async () => [],
    findRuntimeRows: async () => [],
    findRagFailures: async () => [],
    findRuntimeFailures: async () => [],
    findRuntimeRlStateRows: async () => [],
    ...overrides,
  }
}

test("handleGetPerformanceSummary rejects non-admin actors", async () => {
  const response = await handleGetPerformanceSummary(
    requestFor("http://localhost:3000/api/performance/summary?window=24h"),
    baseDeps({
      resolveActor: async () => ({
        userId: "captain-1",
        email: "captain@example.com",
        role: "captain",
        isAdmin: false,
      }),
    }),
  )

  assert.equal(response.status, 403)
})

test("handleGetPerformanceSummary validates window query", async () => {
  const response = await handleGetPerformanceSummary(
    requestFor("http://localhost:3000/api/performance/summary?window=2h"),
    baseDeps(),
  )

  assert.equal(response.status, 400)
})

test("handleGetPerformanceSummary returns runtime economics and RL payload sections", async () => {
  const response = await handleGetPerformanceSummary(
    requestFor("http://localhost:3000/api/performance/summary?window=24h"),
    baseDeps({
      findRagRows: async () => ([
        { effectiveBackend: "vault-local", status: "success", fallbackUsed: false, durationMs: 20 },
      ]),
      findRuntimeRows: async () => ([
        {
          provider: "openai-fallback",
          status: "success",
          fallbackUsed: false,
          durationMs: 120,
          executionKind: "autonomous_task",
          intelligenceTier: "simple",
          intelligenceDecision: "classifier_keep_simple",
          estimatedCostUsd: 0.01,
          estimatedCostEur: 0.0092,
          baselineMaxCostUsd: 0.02,
          baselineMaxCostEur: 0.0184,
          estimatedSavingsUsd: 0.01,
          estimatedSavingsEur: 0.0092,
          rewardScore: 0.62,
          thresholdBefore: 0.62,
          thresholdAfter: 0.63,
          economicsEstimated: true,
        },
      ]),
      findRuntimeRlStateRows: async () => ([
        {
          threshold: 0.63,
          explorationRate: 0.05,
          learningRate: 0.08,
          targetReward: 0.55,
          emaReward: 0.61,
          sampleCount: 5,
          lastConsolidatedAt: new Date("2026-02-11T01:00:00.000Z"),
        },
      ]),
    }),
  )

  assert.equal(response.status, 200)
  const payload = await response.json()
  assert.equal(payload.runtime.economics.economicsSamples, 1)
  assert.equal(payload.runtime.economics.estimatedSavingsUsd, 0.01)
  assert.equal(payload.runtime.intelligence.byTier[0].key, "simple")
  assert.equal(payload.runtime.rlState.usersTracked, 1)
  assert.equal(payload.runtime.rlState.avgThreshold, 0.63)
})
