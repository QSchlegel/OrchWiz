import assert from "node:assert/strict"
import test from "node:test"
import { runCommandPostToolUseHooks } from "./route"

test("runCommandPostToolUseHooks maps hook runner summary", async () => {
  const summary = await runCommandPostToolUseHooks(
    {
      ownerUserId: "user-1",
      toolName: "build",
      status: "failed",
      sessionId: "sess-1",
      toolUseId: "exec-1",
      durationMs: 42,
      output: "build failed",
      error: "exit 1",
      commandPath: "/repo",
      blocked: false,
      commandId: "cmd-1",
      subagentId: "sub-1",
    },
    {
      runHooks: async (input) => {
        assert.equal(input.ownerUserId, "user-1")
        assert.equal(input.toolName, "build")
        assert.equal(input.status, "failed")
        assert.equal(input.sessionId, "sess-1")
        assert.equal(input.toolUseId, "exec-1")
        assert.equal(input.durationMs, 42)
        return {
          matchedHooks: 3,
          delivered: 2,
          failed: 1,
          executions: [],
        }
      },
    },
  )

  assert.deepEqual(summary, {
    matchedHooks: 3,
    delivered: 2,
    failed: 1,
  })
})

test("runCommandPostToolUseHooks fails open when hook runner throws", async () => {
  const summary = await runCommandPostToolUseHooks(
    {
      ownerUserId: "user-1",
      toolName: "build",
      status: "blocked",
      sessionId: null,
      toolUseId: "exec-1",
      durationMs: 3,
      output: null,
      error: null,
      commandPath: null,
      blocked: true,
      commandId: "cmd-1",
      subagentId: null,
    },
    {
      runHooks: async () => {
        throw new Error("network down")
      },
    },
  )

  assert.deepEqual(summary, {
    matchedHooks: 0,
    delivered: 0,
    failed: 0,
  })
})
