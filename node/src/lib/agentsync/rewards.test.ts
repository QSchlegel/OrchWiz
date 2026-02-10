import test from "node:test"
import assert from "node:assert/strict"
import {
  aggregateAgentSyncRewards,
  mapBridgeCallOutcomeToReward,
  mapCommandOutcomeToReward,
  mapVerificationOutcomeToReward,
} from "./rewards"

test("mapCommandOutcomeToReward favors successful fast executions", () => {
  const completedFast = mapCommandOutcomeToReward({ status: "completed", durationMs: 3000 })
  const failedSlow = mapCommandOutcomeToReward({ status: "failed", durationMs: 90000 })
  const blocked = mapCommandOutcomeToReward({ status: "blocked", durationMs: 4000 })

  assert.ok(completedFast > 0)
  assert.ok(failedSlow < 0)
  assert.ok(blocked < completedFast)
})

test("mapVerificationOutcomeToReward applies status and feedback polarity", () => {
  const passed = mapVerificationOutcomeToReward({
    status: "passed",
    feedback: "stable and success",
    iterations: 1,
  })
  const failed = mapVerificationOutcomeToReward({
    status: "failed",
    feedback: "regression and error",
    iterations: 6,
  })

  assert.ok(passed > 0)
  assert.ok(failed < 0)
})

test("mapBridgeCallOutcomeToReward penalizes failures and retries", () => {
  const success = mapBridgeCallOutcomeToReward({ status: "success", attemptCount: 1, latencyMs: 5000 })
  const retried = mapBridgeCallOutcomeToReward({ status: "success", attemptCount: 2, wasRetried: true, latencyMs: 20000 })
  const failed = mapBridgeCallOutcomeToReward({ status: "failed", attemptCount: 1, latencyMs: 12000 })

  assert.ok(success > retried)
  assert.ok(failed < 0)
})

test("aggregateAgentSyncRewards computes trend and evidence gating", () => {
  const now = new Date()
  const aggregate = aggregateAgentSyncRewards(
    [
      { source: "command", reward: 1, occurredAt: now },
      { source: "verification", reward: 0.8, occurredAt: now },
      { source: "bridge_call", reward: 0.6, occurredAt: now },
      { source: "command", reward: 0.4, occurredAt: now },
    ],
    { minSignals: 3 },
  )

  assert.equal(aggregate.signalCount, 4)
  assert.equal(aggregate.shouldApply, true)
  assert.equal(aggregate.trend, "positive")
  assert.ok(aggregate.meanReward > 0)
  assert.equal(aggregate.sourceBreakdown.command.count, 2)
})

