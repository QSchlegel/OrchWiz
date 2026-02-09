import test from "node:test"
import assert from "node:assert/strict"
import { computeBridgeDispatchRetrySchedule } from "./dispatch"

test("computeBridgeDispatchRetrySchedule applies exponential backoff", () => {
  const base = new Date("2026-02-09T12:00:00.000Z")

  const first = computeBridgeDispatchRetrySchedule({
    attempts: 1,
    now: base,
    baseDelayMsOverride: 1000,
    maxAttemptsOverride: 6,
  })
  const second = computeBridgeDispatchRetrySchedule({
    attempts: 2,
    now: base,
    baseDelayMsOverride: 1000,
    maxAttemptsOverride: 6,
  })
  const third = computeBridgeDispatchRetrySchedule({
    attempts: 3,
    now: base,
    baseDelayMsOverride: 1000,
    maxAttemptsOverride: 6,
  })

  assert.equal(first.terminal, false)
  assert.equal(second.terminal, false)
  assert.equal(third.terminal, false)
  assert.equal(first.nextAttemptAt?.getTime(), base.getTime() + 1000)
  assert.equal(second.nextAttemptAt?.getTime(), base.getTime() + 2000)
  assert.equal(third.nextAttemptAt?.getTime(), base.getTime() + 4000)
})

test("computeBridgeDispatchRetrySchedule marks terminal at max attempts", () => {
  const result = computeBridgeDispatchRetrySchedule({
    attempts: 6,
    maxAttemptsOverride: 6,
  })

  assert.equal(result.terminal, true)
  assert.equal(result.nextAttemptAt, null)
})
