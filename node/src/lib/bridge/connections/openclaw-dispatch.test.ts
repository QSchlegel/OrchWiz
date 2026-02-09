import test from "node:test"
import assert from "node:assert/strict"
import { dispatchBridgeConnectionViaOpenClaw } from "./openclaw-dispatch"

function withEnv<T>(patch: Record<string, string | undefined>, run: () => Promise<T>): Promise<T> {
  const original: Record<string, string | undefined> = {}
  for (const [key, value] of Object.entries(patch)) {
    original[key] = process.env[key]
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }

  return run().finally(() => {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }
  })
}

test("dispatchBridgeConnectionViaOpenClaw sends configured request payload", async () => {
  const originalFetch = globalThis.fetch
  let capturedUrl = ""
  let capturedAuth = ""
  let capturedBody: Record<string, unknown> = {}

  await withEnv(
    {
      OPENCLAW_GATEWAY_URL: "http://127.0.0.1:18789",
      OPENCLAW_DISPATCH_PATH: "/v1/message",
      OPENCLAW_API_KEY: "openclaw-secret",
    },
    async () => {
      globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        capturedUrl = String(input)
        capturedAuth = String((init?.headers as Record<string, string>)?.Authorization || "")
        capturedBody = JSON.parse(String(init?.body || "{}")) as Record<string, unknown>

        return new Response(JSON.stringify({ ok: true, providerMessageId: "msg-1" }), { status: 200 })
      }) as typeof globalThis.fetch

      const result = await dispatchBridgeConnectionViaOpenClaw({
        deliveryId: "delivery-1",
        provider: "telegram",
        destination: "-100123",
        message: "hello",
        config: { parseMode: "MarkdownV2" },
        credentials: { botToken: "abc" },
      })

      assert.equal(result.ok, true)
      assert.equal(result.providerMessageId, "msg-1")
      assert.equal(capturedUrl, "http://127.0.0.1:18789/v1/message")
      assert.equal(capturedAuth, "Bearer openclaw-secret")
      assert.equal(capturedBody.requestType, "bridge_connection_dispatch.v1")
    },
  ).finally(() => {
    globalThis.fetch = originalFetch
  })
})

test("dispatchBridgeConnectionViaOpenClaw treats ok:false as failure", async () => {
  const originalFetch = globalThis.fetch

  await withEnv(
    {
      OPENCLAW_GATEWAY_URL: "http://127.0.0.1:18789",
    },
    async () => {
      globalThis.fetch = (async () => {
        return new Response(JSON.stringify({ ok: false, error: "downstream rejected" }), { status: 200 })
      }) as typeof globalThis.fetch

      const result = await dispatchBridgeConnectionViaOpenClaw({
        deliveryId: "delivery-2",
        provider: "discord",
        destination: "#alerts",
        message: "test",
        config: {},
        credentials: {
          webhookUrl: "https://discord.com/api/webhooks/1/abc",
        },
      })

      assert.equal(result.ok, false)
      assert.equal(result.status, 200)
    },
  ).finally(() => {
    globalThis.fetch = originalFetch
  })
})
