import assert from "node:assert/strict"
import test from "node:test"
import {
  configuredHookWebhookTargetAllowlist,
  isHookWebhookTargetAllowed,
} from "@/lib/hooks/allowlist"

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

test("configuredHookWebhookTargetAllowlist falls back to loopback defaults", () => {
  const allowlist = withEnv({ HOOK_WEBHOOK_TARGET_ALLOWLIST: undefined, HOOK_WEBHOOK_ALLOW_NGROK: undefined }, () =>
    configuredHookWebhookTargetAllowlist(),
  )

  assert.deepEqual(allowlist, ["localhost", "127.0.0.1", "::1"])
})

test("configuredHookWebhookTargetAllowlist appends ngrok suffixes when opt-in flag is enabled", () => {
  const allowlist = withEnv(
    {
      HOOK_WEBHOOK_TARGET_ALLOWLIST: undefined,
      HOOK_WEBHOOK_ALLOW_NGROK: "true",
    },
    () => configuredHookWebhookTargetAllowlist(),
  )

  assert.deepEqual(allowlist, [
    "localhost",
    "127.0.0.1",
    "::1",
    ".ngrok-free.app",
    ".ngrok.app",
    ".ngrok.io",
  ])
})

test("isHookWebhookTargetAllowed accepts allowlisted https targets and wildcard suffixes", () => {
  const allowlist = ["https://hooks.example.com", ".corp.example.com"]

  assert.equal(isHookWebhookTargetAllowed("https://hooks.example.com/events", allowlist), true)
  assert.equal(isHookWebhookTargetAllowed("https://ops.corp.example.com/hook", allowlist), true)
  assert.equal(isHookWebhookTargetAllowed("https://evil.example.net/hook", allowlist), false)
})

test("isHookWebhookTargetAllowed rejects non-loopback http and allows loopback http", () => {
  const allowlist = ["hooks.example.com", "localhost"]

  assert.equal(isHookWebhookTargetAllowed("http://hooks.example.com/events", allowlist), false)
  assert.equal(isHookWebhookTargetAllowed("http://localhost:8080/events", allowlist), true)
})

test("isHookWebhookTargetAllowed rejects malformed urls", () => {
  assert.equal(isHookWebhookTargetAllowed("not a url", ["localhost"]), false)
})

test("isHookWebhookTargetAllowed keeps ngrok domains disabled by default and allows them when enabled", () => {
  const disabledAllowlist = withEnv(
    {
      HOOK_WEBHOOK_TARGET_ALLOWLIST: undefined,
      HOOK_WEBHOOK_ALLOW_NGROK: "false",
    },
    () => configuredHookWebhookTargetAllowlist(),
  )
  assert.equal(isHookWebhookTargetAllowed("https://demo.ngrok-free.app/hooks", disabledAllowlist), false)

  const enabledAllowlist = withEnv(
    {
      HOOK_WEBHOOK_TARGET_ALLOWLIST: undefined,
      HOOK_WEBHOOK_ALLOW_NGROK: "true",
    },
    () => configuredHookWebhookTargetAllowlist(),
  )
  assert.equal(isHookWebhookTargetAllowed("https://demo.ngrok-free.app/hooks", enabledAllowlist), true)
})
