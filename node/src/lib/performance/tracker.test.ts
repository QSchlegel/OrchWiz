import test from "node:test"
import assert from "node:assert/strict"
import {
  hashQuery,
  recordRagPerformanceSample,
  recordRuntimePerformanceSample,
} from "./tracker"

function withEnv(key: string, value: string | undefined): () => void {
  const previous = process.env[key]
  if (value === undefined) {
    delete process.env[key]
  } else {
    process.env[key] = value
  }
  return () => {
    if (previous === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = previous
    }
  }
}

test("hashQuery uses deterministic SHA-256 output", () => {
  const restoreSalt = withEnv("PERFORMANCE_QUERY_HASH_SALT", "salt-1")
  try {
    const first = hashQuery("engine startup diagnostics")
    const second = hashQuery("engine startup diagnostics")
    const third = hashQuery("different")

    assert.equal(first.length, 64)
    assert.equal(first, second)
    assert.notEqual(first, third)
    assert.notEqual(first, "engine startup diagnostics")
  } finally {
    restoreSalt()
  }
})

test("recordRagPerformanceSample stores query hash and length but never raw query", async () => {
  const restoreEnabled = withEnv("PERFORMANCE_TRACKING_ENABLED", "true")
  const captured: Record<string, unknown>[] = []

  try {
    await recordRagPerformanceSample(
      {
        route: "/api/vaults/search",
        operation: "search",
        requestedBackend: "auto",
        effectiveBackend: "vault-local",
        mode: "hybrid",
        scope: "all",
        status: "success",
        durationMs: 42.8,
        resultCount: 7,
        fallbackUsed: false,
        query: "open launch checklist",
      },
      {
        create: async (data) => {
          captured.push(data)
        },
      },
    )

    assert.equal(captured.length, 1)
    const row = captured[0]
    assert.equal(typeof row.queryHash, "string")
    assert.equal(row.queryLength, "open launch checklist".length)
    assert.equal((row as Record<string, unknown>).query, undefined)
  } finally {
    restoreEnabled()
  }
})

test("recordRuntimePerformanceSample is fail-open on persist errors", async () => {
  const restoreEnabled = withEnv("PERFORMANCE_TRACKING_ENABLED", "true")
  try {
    await recordRuntimePerformanceSample(
      {
        source: "runtime.session-prompt",
        runtimeProfile: "quartermaster",
        provider: "codex-cli",
        status: "error",
        fallbackUsed: true,
        durationMs: 98,
        errorCode: "RUNTIME_PROVIDER_ERROR",
      },
      {
        create: async () => {
          throw new Error("db unavailable")
        },
      },
    )
  } finally {
    restoreEnabled()
  }
})

test("recordRuntimePerformanceSample persists intelligence economics fields", async () => {
  const restoreEnabled = withEnv("PERFORMANCE_TRACKING_ENABLED", "true")
  const captured: Record<string, unknown>[] = []

  try {
    await recordRuntimePerformanceSample(
      {
        source: "runtime.session-prompt",
        runtimeProfile: "default",
        provider: "openai-fallback",
        status: "success",
        fallbackUsed: false,
        durationMs: 77.2,
        executionKind: "autonomous_task",
        intelligenceTier: "simple",
        intelligenceDecision: "classifier_keep_simple",
        resolvedModel: "gpt-5-mini",
        classifierModel: "gpt-5-nano",
        classifierConfidence: 0.64,
        thresholdBefore: 0.62,
        thresholdAfter: 0.63,
        rewardScore: 0.58,
        estimatedPromptTokens: 900.4,
        estimatedCompletionTokens: 220.2,
        estimatedTotalTokens: 1120.6,
        estimatedCostUsd: 0.008,
        estimatedCostEur: 0.00736,
        baselineMaxCostUsd: 0.019,
        baselineMaxCostEur: 0.01748,
        estimatedSavingsUsd: 0.011,
        estimatedSavingsEur: 0.01012,
        currencyFxUsdToEur: 0.92,
        economicsEstimated: true,
      },
      {
        create: async (data) => {
          captured.push(data)
        },
      },
    )

    assert.equal(captured.length, 1)
    const row = captured[0]
    assert.equal(row.executionKind, "autonomous_task")
    assert.equal(row.intelligenceTier, "simple")
    assert.equal(row.estimatedPromptTokens, 900)
    assert.equal(row.estimatedCompletionTokens, 220)
    assert.equal(row.estimatedTotalTokens, 1121)
    assert.equal(row.economicsEstimated, true)
  } finally {
    restoreEnabled()
  }
})

test("tracking can be disabled via env", async () => {
  const restoreEnabled = withEnv("PERFORMANCE_TRACKING_ENABLED", "false")
  let writes = 0
  try {
    await recordRagPerformanceSample(
      {
        route: "/api/test",
        operation: "search",
        requestedBackend: "auto",
        effectiveBackend: "vault-local",
        status: "success",
        durationMs: 1,
      },
      {
        create: async () => {
          writes += 1
        },
      },
    )
    assert.equal(writes, 0)
  } finally {
    restoreEnabled()
  }
})
