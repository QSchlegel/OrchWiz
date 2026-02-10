import test from "node:test"
import assert from "node:assert/strict"
import {
  ForwardingSecretsError,
  resolveForwardingTargetApiKey,
  storeForwardingTargetApiKey,
  summarizeStoredForwardingTargetApiKey,
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

test("storeForwardingTargetApiKey falls back to plaintext envelope when encryption is optional", async () => {
  await withEnv(
    {
      WALLET_ENCLAVE_ENABLED: "false",
      WALLET_ENCLAVE_REQUIRE_PRIVATE_MEMORY_ENCRYPTION: "false",
    },
    async () => {
      const stored = await storeForwardingTargetApiKey({
        configId: "cfg-1",
        targetApiKey: "forward-target-abc123",
      })

      const summary = summarizeStoredForwardingTargetApiKey(stored)
      assert.equal(summary.storageMode, "plaintext-fallback")
      assert.equal(summary.hasValue, true)
      assert.equal(summary.maskedValue, "********c123")

      const resolved = await resolveForwardingTargetApiKey({
        configId: "cfg-1",
        stored,
      })
      assert.equal(resolved, "forward-target-abc123")
    },
  )
})

test("storeForwardingTargetApiKey returns encrypted envelope and resolves through wallet enclave", async () => {
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
              ciphertextB64: Buffer.from("ciphertext", "utf8").toString("base64"),
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
              plaintextB64: Buffer.from("forward-target-xyz789", "utf8").toString("base64"),
              alg: "AES-256-GCM",
            }),
            { status: 200 },
          )
        }

        return new Response(JSON.stringify({ error: { message: "missing" } }), { status: 404 })
      }) as typeof globalThis.fetch

      const stored = await storeForwardingTargetApiKey({
        configId: "cfg-2",
        targetApiKey: "forward-target-xyz789",
      })

      const summary = summarizeStoredForwardingTargetApiKey(stored)
      assert.equal(summary.storageMode, "encrypted")
      assert.equal(summary.hasValue, true)
      assert.equal(summary.maskedValue, "********")

      const resolved = await resolveForwardingTargetApiKey({
        configId: "cfg-2",
        stored,
      })
      assert.equal(resolved, "forward-target-xyz789")
    },
  ).finally(() => {
    globalThis.fetch = originalFetch
  })
})

test("storeForwardingTargetApiKey fails closed when encryption is required and wallet enclave is disabled", async () => {
  await withEnv(
    {
      WALLET_ENCLAVE_ENABLED: "false",
      WALLET_ENCLAVE_REQUIRE_PRIVATE_MEMORY_ENCRYPTION: "true",
    },
    async () => {
      await assert.rejects(
        () =>
          storeForwardingTargetApiKey({
            configId: "cfg-3",
            targetApiKey: "forward-target-required",
          }),
        (error: unknown) => {
          assert.ok(error instanceof ForwardingSecretsError)
          assert.equal((error as ForwardingSecretsError).code, "WALLET_ENCLAVE_DISABLED")
          return true
        },
      )
    },
  )
})

test("legacy plaintext forwarding target API keys remain resolvable and are masked in summary", async () => {
  const summary = summarizeStoredForwardingTargetApiKey("legacy-forward-target-42")
  assert.equal(summary.storageMode, "legacy-plaintext")
  assert.equal(summary.hasValue, true)
  assert.equal(summary.maskedValue, "********t-42")

  const resolved = await resolveForwardingTargetApiKey({
    configId: "cfg-legacy",
    stored: "legacy-forward-target-42",
  })
  assert.equal(resolved, "legacy-forward-target-42")
})
