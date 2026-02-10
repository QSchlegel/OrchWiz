import test from "node:test"
import assert from "node:assert/strict"
import { codexCliRuntimeProvider } from "./codex-cli"
import { RuntimeProviderError } from "@/lib/runtime/errors"

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

test("codex provider returns recoverable error when codex binary is missing", async () => {
  const restoreCliPath = withEnv("CODEX_CLI_PATH", "/definitely/missing/codex")
  const restoreModel = withEnv("CODEX_RUNTIME_MODEL", undefined)

  try {
    await assert.rejects(
      () =>
        codexCliRuntimeProvider.run(
          {
            sessionId: "session-codex-missing",
            prompt: "respond with ok",
          },
          {
            profile: "default",
            previousErrors: [],
          },
        ),
      (error) => {
        assert.ok(error instanceof RuntimeProviderError)
        assert.equal(error.provider, "codex-cli")
        assert.equal(error.recoverable, true)
        assert.equal(error.code, "CODEX_BINARY_NOT_FOUND")
        return true
      },
    )
  } finally {
    restoreCliPath()
    restoreModel()
  }
})

test("codex provider blocks quartermaster calls without subagent metadata", async () => {
  await assert.rejects(
    () =>
      codexCliRuntimeProvider.run(
        {
          sessionId: "session-codex-policy",
          prompt: "Summarize maintenance risk.",
          metadata: {
            runtime: {
              profile: "quartermaster",
            },
            quartermaster: {
              channel: "ship-quartermaster",
            },
          },
        },
        {
          profile: "quartermaster",
          previousErrors: [],
        },
      ),
    (error) => {
      assert.ok(error instanceof RuntimeProviderError)
      assert.equal(error.provider, "codex-cli")
      assert.equal(error.recoverable, false)
      assert.equal(error.status, 403)
      assert.equal(error.code, "QUARTERMASTER_SUBAGENT_MISSING")
      return true
    },
  )
})
