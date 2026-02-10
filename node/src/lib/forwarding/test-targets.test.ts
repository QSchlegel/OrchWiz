import test from "node:test"
import assert from "node:assert/strict"
import { configuredForwardingTestTargetAllowlist, isForwardingTestTargetAllowed } from "./test-targets"

function withEnv<T>(patch: Record<string, string | undefined>, run: () => T): T {
  const original: Record<string, string | undefined> = {}
  for (const [key, value] of Object.entries(patch)) {
    original[key] = process.env[key]
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }

  try {
    return run()
  } finally {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }
  }
}

test("configuredForwardingTestTargetAllowlist falls back to localhost defaults", () => {
  const list = withEnv({ FORWARDING_TEST_TARGET_ALLOWLIST: undefined }, () =>
    configuredForwardingTestTargetAllowlist(),
  )

  assert.deepEqual(list, ["localhost", "127.0.0.1", "::1"])
})

test("isForwardingTestTargetAllowed accepts configured origins and hosts", () => {
  const allowlist = ["https://bridge.example.com", "internal.example.com", ".corp.example.com"]

  assert.equal(isForwardingTestTargetAllowed("https://bridge.example.com/api/forwarding/events", allowlist), true)
  assert.equal(isForwardingTestTargetAllowed("https://internal.example.com/path", allowlist), true)
  assert.equal(isForwardingTestTargetAllowed("https://ops.corp.example.com/path", allowlist), true)
  assert.equal(isForwardingTestTargetAllowed("https://evil.example.net/path", allowlist), false)
})

test("isForwardingTestTargetAllowed rejects non-http targets", () => {
  const allowlist = ["localhost"]
  assert.equal(isForwardingTestTargetAllowed("ftp://localhost/resource", allowlist), false)
})
