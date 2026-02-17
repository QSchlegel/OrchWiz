import test from "node:test"
import assert from "node:assert/strict"
import { localFallbackRuntimeProvider } from "./local-fallback"

test("local fallback includes structured provider diagnostics", async () => {
  const result = await localFallbackRuntimeProvider.run(
    {
      sessionId: "session-local-fallback-1",
      prompt: "status",
    },
    {
      profile: "quartermaster",
      previousErrors: [
        "codex-cli:CODEX_TIMEOUT:Codex CLI runtime invocation timed out.",
      ],
      previousErrorDetails: [
        {
          provider: "codex-cli",
          code: "CODEX_TIMEOUT",
          message: "Codex CLI runtime invocation timed out.",
        },
      ],
    },
  )

  assert.equal(result.provider, "local-fallback")
  assert.equal(result.fallbackUsed, true)
  assert.match(result.output, /Runtime fallback active/)

  const metadata = (result.metadata || {}) as Record<string, unknown>
  const providerErrors = metadata.providerErrors as Array<Record<string, unknown>>
  assert.equal(Array.isArray(providerErrors), true)
  assert.equal(providerErrors.length, 1)
  assert.equal(providerErrors[0].provider, "codex-cli")
  assert.equal(providerErrors[0].code, "CODEX_TIMEOUT")

  const fallback = metadata.fallback as Record<string, unknown>
  assert.equal(fallback.active, true)
  assert.equal(fallback.provider, "local-fallback")
  assert.equal(Array.isArray(fallback.providerErrors), true)
})

test("local fallback can parse legacy previousErrors format when detail array is empty", async () => {
  const result = await localFallbackRuntimeProvider.run(
    {
      sessionId: "session-local-fallback-2",
      prompt: "status",
    },
    {
      profile: "default",
      previousErrors: [
        "openclaw:OPENCLAW_NOT_CONFIGURED:OpenClaw gateway URL is not configured",
      ],
      previousErrorDetails: [],
    },
  )

  const metadata = (result.metadata || {}) as Record<string, unknown>
  const providerErrors = metadata.providerErrors as Array<Record<string, unknown>>
  assert.equal(providerErrors.length, 1)
  assert.equal(providerErrors[0].provider, "openclaw")
  assert.equal(providerErrors[0].code, "OPENCLAW_NOT_CONFIGURED")
})
