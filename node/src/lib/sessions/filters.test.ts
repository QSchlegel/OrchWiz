import test from "node:test"
import assert from "node:assert/strict"
import { buildSessionWhereFilter, hasBridgeAgentChannel } from "./filters"

test("buildSessionWhereFilter applies bridge channel metadata path filter", () => {
  const where = buildSessionWhereFilter({
    userId: "user-1",
    bridgeChannel: "agent",
  })

  assert.deepEqual(where.metadata, {
    path: ["bridge", "channel"],
    equals: "bridge-agent",
  })
})

test("buildSessionWhereFilter keeps default behavior without bridge channel", () => {
  const where = buildSessionWhereFilter({
    userId: "user-1",
    status: "planning",
    mode: "plan",
    source: "web",
  })

  assert.equal(where.userId, "user-1")
  assert.equal(where.status, "planning")
  assert.equal(where.mode, "plan")
  assert.equal(where.source, "web")
  assert.equal(where.metadata, undefined)
})

test("hasBridgeAgentChannel detects bridge metadata marker", () => {
  assert.equal(
    hasBridgeAgentChannel({
      bridge: {
        channel: "bridge-agent",
      },
    }),
    true,
  )

  assert.equal(
    hasBridgeAgentChannel({
      bridge: {
        channel: "other-channel",
      },
    }),
    false,
  )
})

