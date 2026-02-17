import test from "node:test"
import assert from "node:assert/strict"
import {
  buildCodexCanonicalCommandCandidate,
  codexCliRuntimeProvider,
  resolveCodexTimeoutMs,
  resolveQuartermasterCodexExecutionConfig,
} from "./codex-cli"
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
            previousErrorDetails: [],
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
          previousErrorDetails: [],
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

test("codex provider uses provider proxy when configured", async () => {
  const restoreProxyUrl = withEnv("CODEX_PROVIDER_PROXY_URL", "http://proxy")
  const restoreProxyKey = withEnv("CODEX_PROVIDER_PROXY_API_KEY", "proxy-secret")
  const restoreCliPath = withEnv("CODEX_CLI_PATH", "/definitely/missing/codex")

  const previousFetch = globalThis.fetch
  let fetchCalls = 0
  globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
    fetchCalls += 1
    assert.equal(String(url), "http://proxy/v1/orchwiz/runtime/codex-cli")
    assert.equal(init?.method, "POST")
    assert.equal((init?.headers as Record<string, string>)?.Authorization, "Bearer proxy-secret")

    return new Response(
      JSON.stringify({
        provider: "codex-cli",
        output: "OK",
        fallbackUsed: false,
        metadata: {
          durationMs: 12,
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    )
  }) as typeof fetch

  try {
    const result = await codexCliRuntimeProvider.run(
      {
        sessionId: "session-proxy",
        prompt: "respond with ok",
      },
      {
        profile: "default",
        previousErrors: [],
        previousErrorDetails: [],
      },
    )

    assert.equal(fetchCalls, 1)
    assert.equal(result.provider, "codex-cli")
    assert.equal(result.output, "OK")
  } finally {
    globalThis.fetch = previousFetch
    restoreProxyUrl()
    restoreProxyKey()
    restoreCliPath()
  }
})

test("resolveQuartermasterCodexExecutionConfig maps execution levels to sandbox args", () => {
  const readOnly = resolveQuartermasterCodexExecutionConfig({
    sessionId: "session-qtm-ro",
    prompt: "ping",
    metadata: {
      quartermaster: {
        executionLevel: "read_only",
      },
    },
  })
  assert.equal(readOnly.sandbox, "read-only")
  assert.equal(readOnly.fullAuto, false)

  const workspace = resolveQuartermasterCodexExecutionConfig({
    sessionId: "session-qtm-ws",
    prompt: "ping",
    metadata: {
      quartermaster: {
        executionLevel: "workspace_write",
      },
    },
  })
  assert.equal(workspace.sandbox, "workspace-write")
  assert.equal(workspace.fullAuto, false)

  const danger = resolveQuartermasterCodexExecutionConfig({
    sessionId: "session-qtm-danger",
    prompt: "ping",
    metadata: {
      quartermaster: {
        executionLevel: "danger_full_access",
        loop: {
          fullAuto: true,
        },
      },
    },
  })
  assert.equal(danger.sandbox, "danger-full-access")
  assert.equal(danger.fullAuto, true)
})

test("buildCodexCanonicalCommandCandidate reflects sandbox and full-auto mode", () => {
  const candidate = buildCodexCanonicalCommandCandidate(
    "gpt-5",
    {
      executionLevel: "workspace_write",
      sandbox: "workspace-write",
      fullAuto: true,
    },
  )

  assert.match(candidate, /--sandbox workspace-write/)
  assert.match(candidate, /--full-auto/)
  assert.match(candidate, /-m <model>$/)
})

test("resolveCodexTimeoutMs prefers quartermaster timeout override for quartermaster requests", () => {
  const restoreQuartermasterTimeout = withEnv("CODEX_RUNTIME_TIMEOUT_MS_QUARTERMASTER", "210000")
  const restoreDefaultTimeout = withEnv("CODEX_RUNTIME_TIMEOUT_MS", "120000")

  try {
    const timeout = resolveCodexTimeoutMs({
      sessionId: "session-qtm-timeout",
      prompt: "status",
      metadata: {
        runtime: {
          profile: "quartermaster",
        },
      },
    })
    assert.equal(timeout, 210000)
  } finally {
    restoreQuartermasterTimeout()
    restoreDefaultTimeout()
  }
})

test("resolveCodexTimeoutMs falls back to default timeout for non-quartermaster requests", () => {
  const restoreQuartermasterTimeout = withEnv("CODEX_RUNTIME_TIMEOUT_MS_QUARTERMASTER", "210000")
  const restoreDefaultTimeout = withEnv("CODEX_RUNTIME_TIMEOUT_MS", "90000")

  try {
    const timeout = resolveCodexTimeoutMs({
      sessionId: "session-default-timeout",
      prompt: "status",
      metadata: {
        runtime: {
          profile: "default",
        },
      },
    })
    assert.equal(timeout, 90000)
  } finally {
    restoreQuartermasterTimeout()
    restoreDefaultTimeout()
  }
})
