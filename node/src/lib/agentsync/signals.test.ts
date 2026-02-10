import test from "node:test"
import assert from "node:assert/strict"
import {
  buildAgentSyncSignalDedupeRef,
  isEligibleAgentSyncSubagent,
  recordAgentSyncSignal,
} from "./signals"

test("buildAgentSyncSignalDedupeRef is deterministic", () => {
  const key = buildAgentSyncSignalDedupeRef({
    source: "command",
    sourceId: "exec-123",
    subagentId: "sub-42",
  })

  assert.equal(key, "command:exec-123:sub-42")
})

test("isEligibleAgentSyncSubagent enforces non-shared bridge crew callsigns", () => {
  assert.equal(isEligibleAgentSyncSubagent({ name: "XO-CB01", isShared: false }), true)
  assert.equal(isEligibleAgentSyncSubagent({ name: "XO-CB01", isShared: true }), false)
  assert.equal(isEligibleAgentSyncSubagent({ name: "custom-agent", isShared: false }), false)
})

test("recordAgentSyncSignal upserts using source/sourceId/subagent composite key", async () => {
  const globalAny = globalThis as any
  const previousPrisma = globalAny.prisma

  let capturedArgs: any = null
  globalAny.prisma = {
    agentSyncSignal: {
      upsert: async (args: unknown) => {
        capturedArgs = args
        return { id: "sig-1" }
      },
    },
  }

  try {
    await recordAgentSyncSignal({
      userId: "user-1",
      subagentId: "sub-1",
      source: "verification",
      sourceId: "  run-9  ",
      reward: 0.7,
      details: { status: "passed" },
    })

    assert.ok(capturedArgs)
    assert.deepEqual(capturedArgs.where.source_sourceId_subagentId, {
      source: "verification",
      sourceId: "run-9",
      subagentId: "sub-1",
    })
    assert.equal(capturedArgs.create.reward, 0.7)
  } finally {
    globalAny.prisma = previousPrisma
  }
})

