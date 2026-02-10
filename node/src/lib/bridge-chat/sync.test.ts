import test from "node:test"
import assert from "node:assert/strict"
import {
  BRIDGE_GENERAL_THREAD_TITLE,
  BRIDGE_MIRROR_MAX_ATTEMPTS,
  computeRetrySchedule,
  sessionToThreadDedupeKey,
  threadToSessionDedupeKey,
} from "./sync"

test("mirror dedupe keys are deterministic and directional", () => {
  assert.equal(sessionToThreadDedupeKey("interaction-1"), "s2t:interaction-1")
  assert.equal(threadToSessionDedupeKey("message-1"), "t2s:message-1")
  assert.notEqual(sessionToThreadDedupeKey("id"), threadToSessionDedupeKey("id"))
})

test("general bridge thread title stays stable for UI bootstrap", () => {
  assert.equal(BRIDGE_GENERAL_THREAD_TITLE, "General Chat")
})

test("computeRetrySchedule applies exponential backoff before max attempts", () => {
  const base = new Date("2026-02-09T10:00:00.000Z")

  const first = computeRetrySchedule({ attempts: 1, now: base })
  const second = computeRetrySchedule({ attempts: 2, now: base })
  const third = computeRetrySchedule({ attempts: 3, now: base })

  assert.equal(first.terminal, false)
  assert.equal(second.terminal, false)
  assert.equal(third.terminal, false)
  assert.ok(first.nextAttemptAt)
  assert.ok(second.nextAttemptAt)
  assert.ok(third.nextAttemptAt)

  assert.equal(first.nextAttemptAt?.getTime(), base.getTime() + 1000)
  assert.equal(second.nextAttemptAt?.getTime(), base.getTime() + 2000)
  assert.equal(third.nextAttemptAt?.getTime(), base.getTime() + 4000)
})

test("computeRetrySchedule marks terminal state after max attempts", () => {
  const result = computeRetrySchedule({
    attempts: BRIDGE_MIRROR_MAX_ATTEMPTS,
    now: new Date("2026-02-09T10:00:00.000Z"),
  })

  assert.equal(result.terminal, true)
  assert.equal(result.nextAttemptAt, null)
})
