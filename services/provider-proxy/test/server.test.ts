import assert from "node:assert/strict"
import test from "node:test"
import type { AddressInfo } from "node:net"
import { createApp } from "../src/server.js"
import { resetStreamLimiterState } from "../src/rate-limit.js"

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

async function withEnvPatch<T>(
  patch: Record<string, string | undefined>,
  run: () => Promise<T>,
): Promise<T> {
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
    return await run()
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

async function listen(runCodex: Parameters<typeof createApp>[0]["runCodex"] = async () => ({
  output: "OK",
  durationMs: 1,
  modelUsed: "gpt-5",
  cliPath: "codex",
  workspace: "/workspace",
  timeoutMs: 120000,
})) {
  const app = createApp({
    runCodex,
  })

  const server = app.listen(0, "127.0.0.1")
  await new Promise<void>((resolve) => server.once("listening", () => resolve()))
  const addr = server.address() as AddressInfo
  const baseUrl = `http://127.0.0.1:${addr.port}`

  return {
    baseUrl,
    close: async () => {
      await new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      )
    },
  }
}

test("provider-proxy rejects /v1 without bearer token", async () => {
  resetStreamLimiterState()
  const restoreKey = withEnv("PROVIDER_PROXY_API_KEY", "secret")
  const { baseUrl, close } = await listen()

  try {
    const res = await fetch(`${baseUrl}/v1/responses`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "gpt-5", input: "hi" }),
    })

    assert.equal(res.status, 401)
  } finally {
    await close()
    restoreKey()
  }
})

test("provider-proxy /v1/responses returns output_text", async () => {
  resetStreamLimiterState()
  const restoreKey = withEnv("PROVIDER_PROXY_API_KEY", "secret")
  const { baseUrl, close } = await listen()

  try {
    const res = await fetch(`${baseUrl}/v1/responses`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer secret",
      },
      body: JSON.stringify({ model: "gpt-5", input: "Respond with OK" }),
    })

    assert.equal(res.status, 200)
    const payload = await res.json() as Record<string, unknown>
    assert.equal(payload.output_text, "OK")
    assert.ok(Array.isArray(payload.output))
  } finally {
    await close()
    restoreKey()
  }
})

test("provider-proxy /v1/orchwiz/runtime/codex-cli returns RuntimeResult", async () => {
  resetStreamLimiterState()
  const restoreKey = withEnv("PROVIDER_PROXY_API_KEY", "secret")
  const { baseUrl, close } = await listen()

  try {
    const res = await fetch(`${baseUrl}/v1/orchwiz/runtime/codex-cli`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer secret",
      },
      body: JSON.stringify({ sessionId: "s1", prompt: "hi" }),
    })

    assert.equal(res.status, 200)
    const payload = await res.json() as Record<string, unknown>
    assert.equal(payload.provider, "codex-cli")
    assert.equal(payload.output, "OK")
    assert.equal(payload.fallbackUsed, false)
  } finally {
    await close()
    restoreKey()
  }
})

test("provider-proxy stream responses include hardened SSE headers", async () => {
  resetStreamLimiterState()
  const restoreKey = withEnv("PROVIDER_PROXY_API_KEY", "secret")
  const { baseUrl, close } = await listen()

  try {
    const res = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer secret",
      },
      body: JSON.stringify({
        model: "gpt-5",
        stream: true,
        messages: [{ role: "user", content: "hello" }],
      }),
    })

    assert.equal(res.status, 200)
    assert.equal(res.headers.get("cache-control"), "no-store, private, no-transform")
    assert.equal(res.headers.get("pragma"), "no-cache")
    assert.equal(res.headers.get("x-content-type-options"), "nosniff")
    assert.equal(res.headers.get("x-accel-buffering"), "no")
    assert.equal(res.headers.get("content-type"), "text/event-stream")
    await res.body?.cancel()
  } finally {
    await close()
    restoreKey()
  }
})

test("provider-proxy enforces streaming rate limits when enabled", async () => {
  resetStreamLimiterState()
  await withEnvPatch(
    {
      PROVIDER_PROXY_API_KEY: "secret",
      PROVIDER_PROXY_STREAM_LIMITS_ENFORCE: "true",
      PROVIDER_PROXY_STREAM_RATE_LIMIT: "1",
      PROVIDER_PROXY_STREAM_RATE_WINDOW_MS: "60000",
      PROVIDER_PROXY_STREAM_MAX_CONCURRENT: "20",
    },
    async () => {
      const { baseUrl, close } = await listen()
      try {
        const first = await fetch(`${baseUrl}/v1/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer secret",
          },
          body: JSON.stringify({
            model: "gpt-5",
            stream: true,
            messages: [{ role: "user", content: "hello" }],
          }),
        })
        assert.equal(first.status, 200)
        await first.body?.cancel()

        const second = await fetch(`${baseUrl}/v1/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer secret",
          },
          body: JSON.stringify({
            model: "gpt-5",
            stream: true,
            messages: [{ role: "user", content: "hello again" }],
          }),
        })
        assert.equal(second.status, 429)
      } finally {
        await close()
      }
    },
  )
})

test("provider-proxy enforces streaming concurrency limits when enabled", async () => {
  resetStreamLimiterState()
  await withEnvPatch(
    {
      PROVIDER_PROXY_API_KEY: "secret",
      PROVIDER_PROXY_STREAM_LIMITS_ENFORCE: "true",
      PROVIDER_PROXY_STREAM_RATE_LIMIT: "30",
      PROVIDER_PROXY_STREAM_RATE_WINDOW_MS: "60000",
      PROVIDER_PROXY_STREAM_MAX_CONCURRENT: "1",
    },
    async () => {
      let releaseFirstRun: (() => void) | null = null
      const firstRunStarted = new Promise<void>((resolve) => {
        releaseFirstRun = resolve
      })

      const { baseUrl, close } = await listen(async () => {
        await firstRunStarted
        return {
          output: "OK",
          durationMs: 1,
          modelUsed: "gpt-5",
          cliPath: "codex",
          workspace: "/workspace",
          timeoutMs: 120000,
        }
      })

      try {
        const firstRequestPromise = fetch(`${baseUrl}/v1/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer secret",
          },
          body: JSON.stringify({
            model: "gpt-5",
            stream: true,
            messages: [{ role: "user", content: "hold" }],
          }),
        })

        // Let the first request acquire its slot.
        await new Promise((resolve) => setTimeout(resolve, 50))

        const second = await fetch(`${baseUrl}/v1/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer secret",
          },
          body: JSON.stringify({
            model: "gpt-5",
            stream: true,
            messages: [{ role: "user", content: "second" }],
          }),
        })
        assert.equal(second.status, 429)

        releaseFirstRun?.()
        const first = await firstRequestPromise
        assert.equal(first.status, 200)
        await first.body?.cancel()
      } finally {
        await close()
      }
    },
  )
})
