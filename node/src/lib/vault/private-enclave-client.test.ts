import test from "node:test"
import assert from "node:assert/strict"
import {
  decryptPrivateVaultContent,
  encryptPrivateVaultContent,
} from "./private-enclave-client"

const ORIGINAL_FETCH = global.fetch

function mockJsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  })
}

test("private enclave client encrypt/decrypt roundtrip with mocked enclave", async () => {
  process.env.WALLET_ENCLAVE_ENABLED = "true"
  process.env.WALLET_ENCLAVE_REQUIRE_PRIVATE_MEMORY_ENCRYPTION = "true"
  process.env.WALLET_ENCLAVE_URL = "http://127.0.0.1:3377"

  global.fetch = (async (input: URL | RequestInfo, init?: RequestInit) => {
    const url = String(input)
    const body = JSON.parse(String(init?.body || "{}")) as Record<string, string>

    if (url.endsWith("/v1/crypto/encrypt")) {
      return mockJsonResponse({
        context: body.context,
        ciphertextB64: body.plaintextB64,
        nonceB64: "nonce",
        alg: "AES-256-GCM",
      })
    }

    if (url.endsWith("/v1/crypto/decrypt")) {
      return mockJsonResponse({
        context: body.context,
        plaintextB64: body.ciphertextB64,
        alg: "AES-256-GCM",
      })
    }

    return mockJsonResponse({
      error: {
        code: "NOT_FOUND",
        message: "missing",
      },
    }, 404)
  }) as typeof fetch

  try {
    const encrypted = await encryptPrivateVaultContent({
      relativePath: "notes/private.md",
      plaintext: "hello vault",
    })

    const decrypted = await decryptPrivateVaultContent({
      envelope: encrypted,
    })

    assert.equal(decrypted, "hello vault")
    assert.equal(encrypted.context, "vault:agent-private:notes/private.md")
  } finally {
    global.fetch = ORIGINAL_FETCH
  }
})
