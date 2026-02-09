import test from "node:test"
import assert from "node:assert/strict"
import { runSessionRuntime } from "./index"

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

test("runtime falls back locally when no provider configured", async () => {
  const restoreOpenClaw = withEnv("OPENCLAW_GATEWAY_URL", undefined)
  const restoreOpenAi = withEnv("OPENAI_API_KEY", undefined)
  const restoreFallbackFlag = withEnv("ENABLE_OPENAI_RUNTIME_FALLBACK", "false")

  try {
    const result = await runSessionRuntime({
      sessionId: "session-1",
      prompt: "Explain the current task status",
    })

    assert.equal(result.provider, "local-fallback")
    assert.equal(result.fallbackUsed, true)
    assert.match(result.output, /Runtime fallback active/)
  } finally {
    restoreOpenClaw()
    restoreOpenAi()
    restoreFallbackFlag()
  }
})
