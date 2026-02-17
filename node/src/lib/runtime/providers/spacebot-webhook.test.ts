import assert from "node:assert/strict"
import test from "node:test"
import { RuntimeProviderError } from "@/lib/runtime/errors"
import { spacebotWebhookRuntimeProvider } from "./spacebot-webhook"

function withEnv<T>(patch: Record<string, string | undefined>, run: () => Promise<T>): Promise<T> {
  const previous: Record<string, string | undefined> = {}
  for (const [key, value] of Object.entries(patch)) {
    previous[key] = process.env[key]
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }

  return run().finally(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }
  })
}

test("spacebot webhook runtime returns text output on send/poll success", async () => {
  const originalFetch = globalThis.fetch
  let calls = 0

  await withEnv(
    {
      SPACEBOT_CONNECTOR_ENABLED: "true",
      SPACEBOT_WEBHOOK_BASE_URL: "http://spacebot:18789",
    },
    async () => {
      globalThis.fetch = (async () => {
        calls += 1
        if (calls === 1) {
          return new Response(null, { status: 202 })
        }

        return new Response(
          JSON.stringify({
            messages: [
              {
                type: "text",
                content: "Spacebot response",
              },
            ],
          }),
          { status: 200 },
        )
      }) as typeof fetch

      const result = await spacebotWebhookRuntimeProvider.run(
        {
          sessionId: "session-spacebot-success",
          prompt: "Hello Spacebot",
        },
        {
          profile: "default",
          previousErrors: [],
          previousErrorDetails: [],
        },
      )

      assert.equal(result.provider, "spacebot-webhook")
      assert.equal(result.output, "Spacebot response")
      assert.equal(result.fallbackUsed, false)
    },
  ).finally(() => {
    globalThis.fetch = originalFetch
  })
})

test("spacebot webhook runtime surfaces recoverable send errors", async () => {
  const originalFetch = globalThis.fetch

  await withEnv(
    {
      SPACEBOT_CONNECTOR_ENABLED: "true",
      SPACEBOT_WEBHOOK_BASE_URL: "http://spacebot:18789",
    },
    async () => {
      globalThis.fetch = (async () => {
        throw new Error("connection refused")
      }) as typeof fetch

      await assert.rejects(
        async () =>
          spacebotWebhookRuntimeProvider.run(
            {
              sessionId: "session-spacebot-send-error",
              prompt: "Hello Spacebot",
            },
            {
              profile: "default",
              previousErrors: [],
              previousErrorDetails: [],
            },
          ),
        (error) => {
          assert.ok(error instanceof RuntimeProviderError)
          assert.equal(error.provider, "spacebot-webhook")
          assert.equal(error.code, "SPACEBOT_SEND_FAILED")
          return true
        },
      )
    },
  ).finally(() => {
    globalThis.fetch = originalFetch
  })
})

test("spacebot webhook runtime times out when poll has no messages", async () => {
  const originalFetch = globalThis.fetch
  let sendCalled = false

  await withEnv(
    {
      SPACEBOT_CONNECTOR_ENABLED: "true",
      SPACEBOT_WEBHOOK_BASE_URL: "http://spacebot:18789",
      SPACEBOT_WEBHOOK_TIMEOUT_MS: "350",
      SPACEBOT_WEBHOOK_POLL_INTERVAL_MS: "250",
    },
    async () => {
      globalThis.fetch = (async () => {
        if (!sendCalled) {
          sendCalled = true
          return new Response(null, { status: 202 })
        }

        return new Response(JSON.stringify({ messages: [] }), { status: 200 })
      }) as typeof fetch

      await assert.rejects(
        async () =>
          spacebotWebhookRuntimeProvider.run(
            {
              sessionId: "session-spacebot-timeout",
              prompt: "Hello Spacebot",
            },
            {
              profile: "default",
              previousErrors: [],
              previousErrorDetails: [],
            },
          ),
        (error) => {
          assert.ok(error instanceof RuntimeProviderError)
          assert.equal(error.provider, "spacebot-webhook")
          assert.equal(error.code, "SPACEBOT_TIMEOUT")
          return true
        },
      )
    },
  ).finally(() => {
    globalThis.fetch = originalFetch
  })
})
