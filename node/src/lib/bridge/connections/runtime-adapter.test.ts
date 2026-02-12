import test from "node:test"
import assert from "node:assert/strict"
import { dispatchBridgeConnectionViaRuntime } from "./runtime-adapter"

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

test("dispatchBridgeConnectionViaRuntime routes openclaw runtime through OpenClaw adapter", async () => {
  const originalFetch = globalThis.fetch
  let capturedUrl = ""

  await withEnv(
    {
      OPENCLAW_GATEWAY_URL: "http://127.0.0.1:18789",
      OPENCLAW_DISPATCH_PATH: "/v1/message",
    },
    async () => {
      globalThis.fetch = (async (input: RequestInfo | URL) => {
        capturedUrl = String(input)
        return new Response(JSON.stringify({ ok: true, providerMessageId: "msg-1" }), { status: 200 })
      }) as typeof globalThis.fetch

      const result = await dispatchBridgeConnectionViaRuntime({
        runtimeId: "openclaw",
        input: {
          deliveryId: "delivery-1",
          provider: "telegram",
          destination: "-100123",
          message: "hello",
          config: {},
          credentials: { botToken: "abc" },
          metadata: {
            test: true,
          },
        },
      })

      assert.equal(result.ok, true)
      assert.equal(capturedUrl, "http://127.0.0.1:18789/v1/message")
    },
  ).finally(() => {
    globalThis.fetch = originalFetch
  })
})

test("dispatchBridgeConnectionViaRuntime rejects unsupported runtime ids", async () => {
  await assert.rejects(
    async () =>
      dispatchBridgeConnectionViaRuntime({
        runtimeId: "nano-claw",
        input: {
          deliveryId: "delivery-2",
          provider: "discord",
          destination: "#alerts",
          message: "hello",
          config: {},
          credentials: { webhookUrl: "https://discord.com/api/webhooks/1/abc" },
        },
      }),
    /Unsupported bridge dispatch runtime: nano-claw/,
  )
})
