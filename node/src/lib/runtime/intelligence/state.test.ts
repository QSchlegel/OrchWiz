import assert from "node:assert/strict"
import test from "node:test"
import type { RuntimeIntelligenceConfig } from "./config"
import {
  consolidateRuntimeIntelligencePolicyStates,
  loadRuntimeIntelligencePolicyState,
  updateRuntimeIntelligencePolicyStateOnline,
} from "./state"

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

test("loadRuntimeIntelligencePolicyState returns defaults for missing userId", async () => {
  const state = await loadRuntimeIntelligencePolicyState(null, buildConfig())
  assert.equal(state.threshold, 0.62)
  assert.equal(state.explorationRate, 0.05)
  assert.equal(state.sampleCount, 0)
  assert.equal(state.persisted, false)
})

test("updateRuntimeIntelligencePolicyStateOnline clamps threshold to configured bounds", async () => {
  const globalAny = globalThis as any
  const previousPrisma = globalAny.prisma
  const updates: Array<Record<string, unknown>> = []

  globalAny.prisma = {
    runtimeIntelligencePolicyState: {
      upsert: async () => ({
        threshold: 0.9,
        explorationRate: 0.05,
        learningRate: 0.5,
        targetReward: 0.2,
        emaReward: 0.3,
        sampleCount: 10,
      }),
      update: async (args: { data: Record<string, unknown> }) => {
        updates.push(args.data)
        return null
      },
    },
  }

  try {
    const thresholdAfter = await updateRuntimeIntelligencePolicyStateOnline({
      userId: "user-1",
      rewardScore: 1.5,
      thresholdBefore: 0.9,
      config: buildConfig(),
    })

    assert.equal(thresholdAfter, 0.95)
    assert.equal(updates.length, 1)
    assert.equal(updates[0].threshold, 0.95)
  } finally {
    globalAny.prisma = previousPrisma
  }
})

test("consolidateRuntimeIntelligencePolicyStates updates policy rows and reports summary", async () => {
  const globalAny = globalThis as any
  const previousPrisma = globalAny.prisma
  const updatedUsers: string[] = []

  globalAny.prisma = {
    runtimeIntelligencePolicyState: {
      findMany: async () => ([
        {
          userId: "user-a",
          threshold: 0.62,
          explorationRate: 0.05,
          learningRate: 0.08,
          targetReward: 0.55,
          emaReward: 0.7,
        },
        {
          userId: "user-b",
          threshold: 0.7,
          explorationRate: 0.02,
          learningRate: 0.08,
          targetReward: 0.55,
          emaReward: 0.3,
        },
      ]),
      update: async (args: { where: { userId: string } }) => {
        updatedUsers.push(args.where.userId)
        return null
      },
    },
  }

  try {
    const now = new Date("2026-02-11T00:00:00.000Z")
    const summary = await consolidateRuntimeIntelligencePolicyStates(buildConfig(), now)
    assert.equal(summary.checked, 2)
    assert.equal(summary.updated, 2)
    assert.equal(summary.failed, 0)
    assert.equal(summary.executedAt, now.toISOString())
    assert.deepEqual(updatedUsers.sort(), ["user-a", "user-b"])
  } finally {
    globalAny.prisma = previousPrisma
  }
})
