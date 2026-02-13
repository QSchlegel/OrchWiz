import assert from "node:assert/strict"
import test from "node:test"
import type { AddressInfo } from "node:net"
import { createApp } from "../src/server.js"

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

async function listen() {
  const app = createApp({
    runCodex: async () => ({
      output: "OK",
      durationMs: 1,
      modelUsed: "gpt-5",
      cliPath: "codex",
      workspace: "/workspace",
      timeoutMs: 120000,
    }),
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

