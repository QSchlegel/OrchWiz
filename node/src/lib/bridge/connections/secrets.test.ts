import test from "node:test"
import assert from "node:assert/strict"
import {
  resolveBridgeConnectionCredentials,
  storeBridgeConnectionCredentials,
  type StoredBridgeConnectionCredentials,
} from "./secrets"

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

test("storeBridgeConnectionCredentials falls back to plaintext when encryption is optional", async () => {
  await withEnv(
    {
      WALLET_ENCLAVE_ENABLED: "false",
      WALLET_ENCLAVE_REQUIRE_PRIVATE_MEMORY_ENCRYPTION: "false",
    },
    async () => {
      const stored = await storeBridgeConnectionCredentials({
        connectionId: "conn-1",
        credentials: {
          botToken: "token-1",
        },
      })

      assert.equal(stored.storageMode, "plaintext-fallback")
      assert.deepEqual((stored as StoredBridgeConnectionCredentials & { storageMode: "plaintext-fallback" }).plaintext, {
        botToken: "token-1",
      })
    },
  )
})

test("encrypted credentials roundtrip through wallet-enclave client", async () => {
  const originalFetch = globalThis.fetch

  await withEnv(
    {
      WALLET_ENCLAVE_ENABLED: "true",
      WALLET_ENCLAVE_REQUIRE_PRIVATE_MEMORY_ENCRYPTION: "true",
      WALLET_ENCLAVE_URL: "http://127.0.0.1:3377",
    },
    async () => {
      globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        const body = JSON.parse(String(init?.body || "{}")) as Record<string, string>

        if (url.endsWith("/v1/crypto/encrypt")) {
          return new Response(
            JSON.stringify({
              context: body.context,
              ciphertextB64: Buffer.from("cipher", "utf8").toString("base64"),
              nonceB64: Buffer.from("nonce", "utf8").toString("base64"),
              alg: "AES-256-GCM",
            }),
            { status: 200 },
          )
        }

        if (url.endsWith("/v1/crypto/decrypt")) {
          return new Response(
            JSON.stringify({
              context: body.context,
              plaintextB64: Buffer.from(JSON.stringify({ botToken: "token-2" }), "utf8").toString("base64"),
              alg: "AES-256-GCM",
            }),
            { status: 200 },
          )
        }

        return new Response(JSON.stringify({ error: { message: "missing" } }), { status: 404 })
      }) as typeof globalThis.fetch

      const stored = await storeBridgeConnectionCredentials({
        connectionId: "conn-2",
        credentials: {
          botToken: "token-2",
        },
      })

      assert.equal(stored.storageMode, "encrypted")

      const resolved = await resolveBridgeConnectionCredentials({
        provider: "telegram",
        connectionId: "conn-2",
        stored,
      })

      assert.deepEqual(resolved, { botToken: "token-2" })
    },
  ).finally(() => {
    globalThis.fetch = originalFetch
  })
})
