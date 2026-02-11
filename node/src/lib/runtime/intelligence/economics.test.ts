import assert from "node:assert/strict"
import test from "node:test"
import {
  computeRuntimeReward,
  estimateRuntimeEconomics,
  estimateTokenCount,
} from "./economics"
import type { RuntimeIntelligenceConfig } from "./config"

function buildConfig(): RuntimeIntelligenceConfig {
  return {
    enabled: true,
    requireControllableProviders: true,
    maxModel: "gpt-5",
    simpleModel: "gpt-5-mini",
    classifierModel: "gpt-5-nano",
    classifierTimeoutMs: 6000,
    langfusePromptName: "runtime-intelligence-autonomous-classifier",
    langfusePromptLabel: "production",
    langfusePromptVersion: null,
    langfusePromptCacheTtlSeconds: 60,
    usdToEur: 0.92,
    modelPricingUsdPer1M: {
      "gpt-5": { input: 1.25, output: 10 },
      "gpt-5-mini": { input: 0.25, output: 2 },
      "gpt-5-nano": { input: 0.05, output: 0.4 },
    },
    thresholdDefault: 0.62,
    thresholdMin: 0.35,
    thresholdMax: 0.95,
    learningRate: 0.08,
    explorationRate: 0.05,
    targetReward: 0.55,
    nightlyCronToken: null,
  }
}

test("estimateTokenCount uses char-based heuristic", () => {
  assert.equal(estimateTokenCount(""), 0)
  assert.equal(estimateTokenCount("abcd"), 1)
  assert.equal(estimateTokenCount("abcdefgh"), 2)
})

test("estimateRuntimeEconomics computes estimated costs and savings in USD/EUR", () => {
  const economics = estimateRuntimeEconomics({
    prompt: "a".repeat(4000),
    output: "b".repeat(2000),
    selectedModel: "gpt-5-mini",
    baselineMaxModel: "gpt-5",
    config: buildConfig(),
  })

  assert.equal(economics.estimatedPromptTokens, 1000)
  assert.equal(economics.estimatedCompletionTokens, 500)
  assert.equal(economics.estimatedTotalTokens, 1500)
  assert.equal(economics.economicsEstimated, true)
  assert.ok(economics.estimatedCostUsd < economics.baselineMaxCostUsd)
  assert.equal(economics.estimatedCostEur, Number((economics.estimatedCostUsd * 0.92).toFixed(8)))
  assert.equal(economics.estimatedSavingsEur, Number((economics.estimatedSavingsUsd * 0.92).toFixed(8)))
})

test("computeRuntimeReward blends status, latency, fallback, and savings", () => {
  const fastSuccess = computeRuntimeReward({
    status: "success",
    durationMs: 2000,
    fallbackUsed: false,
    estimatedSavingsUsd: 0.1,
  })
  const slowFallback = computeRuntimeReward({
    status: "success",
    durationMs: 80000,
    fallbackUsed: true,
    estimatedSavingsUsd: -0.1,
  })

  assert.ok(fastSuccess > slowFallback)
  assert.ok(fastSuccess <= 2)
  assert.ok(slowFallback >= -2)
})
