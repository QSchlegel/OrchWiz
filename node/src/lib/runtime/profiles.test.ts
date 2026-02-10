import test from "node:test"
import assert from "node:assert/strict"
import {
  resolveRuntimeProfileConfig,
  resolveRuntimeProfileName,
  resolveRuntimeProviderOrder,
} from "./profiles"

function withEnv<K extends keyof NodeJS.ProcessEnv>(key: K, value: string | undefined) {
  const previous = process.env[key]
  if (value === undefined) {
    delete process.env[key]
  } else {
    process.env[key] = value
  }
  return () => {
    if (previous === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = previous
    }
  }
}

test("resolveRuntimeProfileName defaults to default profile", () => {
  assert.equal(resolveRuntimeProfileName(undefined), "default")
  assert.equal(resolveRuntimeProfileName({}), "default")
  assert.equal(resolveRuntimeProfileName({ runtime: { profile: "unknown" } }), "default")
})

test("resolveRuntimeProfileName recognizes quartermaster profile", () => {
  assert.equal(resolveRuntimeProfileName({ runtime: { profile: "quartermaster" } }), "quartermaster")
  assert.equal(resolveRuntimeProfileName({ runtime: { profile: "QUARTERMASTER" } }), "quartermaster")
})

test("resolveRuntimeProviderOrder ignores unknown providers and appends local fallback", () => {
  const restore = withEnv("RUNTIME_PROFILE_DEFAULT", "openclaw,unknown-provider,openai-fallback")

  try {
    const providers = resolveRuntimeProviderOrder("default")
    assert.deepEqual(providers, ["openclaw", "openai-fallback", "local-fallback"])
  } finally {
    restore()
  }
})

test("resolveRuntimeProfileConfig returns quartermaster chain by metadata", () => {
  const restore = withEnv("RUNTIME_PROFILE_QUARTERMASTER", undefined)

  try {
    const config = resolveRuntimeProfileConfig({
      sessionId: "session-1",
      prompt: "hello",
      metadata: {
        runtime: {
          profile: "quartermaster",
        },
      },
    })

    assert.equal(config.profile, "quartermaster")
    assert.deepEqual(config.providerOrder, ["codex-cli", "openclaw", "openai-fallback", "local-fallback"])
  } finally {
    restore()
  }
})
