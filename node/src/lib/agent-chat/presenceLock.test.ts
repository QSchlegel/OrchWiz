import assert from "node:assert/strict"
import test from "node:test"
import {
  DEFAULT_LOCK_TIMEOUT_MS,
  getAgentChatLockTimeoutMsFromEnv,
  shouldLockFromAbsence,
} from "./presenceLock"

test("shouldLockFromAbsence returns false when lastPresenceAt is null", () => {
  assert.equal(
    shouldLockFromAbsence({
      now: 1_000_000,
      lastPresenceAt: null,
      timeoutMs: 300_000,
    }),
    false,
  )
})

test("shouldLockFromAbsence returns false when elapsed is below timeout", () => {
  const timeoutMs = 300_000
  const now = 1_000_000
  assert.equal(
    shouldLockFromAbsence({
      now,
      lastPresenceAt: now - timeoutMs + 1,
      timeoutMs,
    }),
    false,
  )
})

test("shouldLockFromAbsence returns true when elapsed exceeds timeout", () => {
  const timeoutMs = 300_000
  const now = 1_000_000
  assert.equal(
    shouldLockFromAbsence({
      now,
      lastPresenceAt: now - timeoutMs - 1,
      timeoutMs,
    }),
    true,
  )
})

test("getAgentChatLockTimeoutMsFromEnv falls back to default when env is missing or invalid", () => {
  assert.equal(getAgentChatLockTimeoutMsFromEnv(undefined), DEFAULT_LOCK_TIMEOUT_MS)
  assert.equal(getAgentChatLockTimeoutMsFromEnv(""), DEFAULT_LOCK_TIMEOUT_MS)
  assert.equal(getAgentChatLockTimeoutMsFromEnv("not-a-number"), DEFAULT_LOCK_TIMEOUT_MS)
})

test("getAgentChatLockTimeoutMsFromEnv clamps env values to sane bounds", () => {
  assert.equal(getAgentChatLockTimeoutMsFromEnv("1000"), 30_000)
  assert.equal(getAgentChatLockTimeoutMsFromEnv("999999999"), 3_600_000)
})

